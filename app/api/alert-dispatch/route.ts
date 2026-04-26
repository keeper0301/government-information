// ============================================================
// 맞춤 알림 발송 cron
// ============================================================
// 매일 1회 실행 — 지난 24시간 동안 새로 수집된 정책을
// 활성 user_alert_rules 와 매칭해서 이메일(+알림톡) 발송.
// alert_deliveries 에 기록, unique index 덕에 중복 발송 자동 방지.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCronFailure, sendCustomAlertEmail } from "@/lib/email";
import { findMatchingPrograms, type AlertRule } from "@/lib/alerts/matching";
import { getUserTier } from "@/lib/subscription";
import { sendAlimtalk } from "@/lib/kakao-alimtalk";
import { hasActiveConsent } from "@/lib/consent";

export const maxDuration = 300; // 5분

async function runAlertDispatch(jobLabel: string) {
  try {
    const supabase = createAdminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24시간 전

    // 1) 활성 규칙 전체 조회
    const { data: rules, error: rulesErr } = await supabase
      .from("user_alert_rules")
      .select("*")
      .eq("is_active", true);

    if (rulesErr) throw rulesErr;
    if (!rules || rules.length === 0) {
      return NextResponse.json({ dispatched: 0, note: "활성 규칙 없음" });
    }

    // 2) 사용자 이메일 일괄 조회 (auth.users) — listUsers 가 전체 페이지 반환하므로
    // 별도 user_id 화이트리스트 dedupe 없이 emailByUserId map 만 구축.
    const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emailByUserId = new Map<string, string>();
    for (const u of users?.users || []) {
      if (u.id && u.email) emailByUserId.set(u.id, u.email);
    }

    let dispatchedEmail = 0;
    let dispatchedKakao = 0;
    let skipped = 0;
    let emailFailures = 0;
    let kakaoSkippedConsent = 0;
    const emailFailureDetail: string[] = [];

    // 사용자별 kakao_messaging 동의 상태 캐시 — 같은 사용자가 규칙 여러 개 들고 있어도 1회만 조회.
    // 동의 없으면 알림톡 발송 불가 (정보통신망법 제50조 수신동의 의무).
    const kakaoConsentCache = new Map<string, boolean>();
    async function getKakaoConsent(userId: string): Promise<boolean> {
      const cached = kakaoConsentCache.get(userId);
      if (cached !== undefined) return cached;
      const ok = await hasActiveConsent(userId, "kakao_messaging");
      kakaoConsentCache.set(userId, ok);
      return ok;
    }

    for (const rule of rules as AlertRule[]) {
      const matches = await findMatchingPrograms(supabase, rule, since, 20);
      if (matches.length === 0) continue;

      // 이미 발송한 (rule_id, program) 조합 조회 — 중복 필터
      const programKeys = matches.map((m) => ({ table: m.table, id: m.id }));
      const { data: existing } = await supabase
        .from("alert_deliveries")
        .select("program_table, program_id, channel")
        .eq("rule_id", rule.id)
        .in(
          "program_id",
          programKeys.map((k) => k.id),
        );

      const alreadyEmailed = new Set<string>();
      const alreadyKakao = new Set<string>();
      for (const e of existing || []) {
        const key = `${e.program_table}:${e.program_id}`;
        if (e.channel === "email") alreadyEmailed.add(key);
        if (e.channel === "kakao") alreadyKakao.add(key);
      }

      // 티어 확인 — 카카오 알림톡은 pro만
      const tier = await getUserTier(rule.user_id);
      const canKakao = tier === "pro" && rule.channels.includes("kakao") && !!rule.phone_number;
      const canEmail = rule.channels.includes("email") && tier !== "free";

      // ━━ 이메일: 매칭된 것 중 아직 발송 안한 것만 묶어 1회 ━━
      if (canEmail) {
        const toSend = matches.filter((m) => !alreadyEmailed.has(`${m.table}:${m.id}`));
        const email = emailByUserId.get(rule.user_id);
        if (toSend.length > 0 && email) {
          try {
            const { error } = await sendCustomAlertEmail({
              to: email,
              ruleName: rule.name,
              programs: toSend.map((m) => ({
                id: m.id,
                title: m.title,
                source: m.source,
                applyUrl: m.apply_url,
                applyEnd: m.apply_end,
                table: m.table,
              })),
            });

            // 각 매칭별로 delivery 기록 (unique index 로 중복 자동 방지)
            for (const m of toSend) {
              await supabase.from("alert_deliveries").insert({
                rule_id: rule.id,
                user_id: rule.user_id,
                program_table: m.table,
                program_id: m.id,
                program_title: m.title,
                channel: "email",
                status: error ? "failed" : "sent",
                error: error ? String(error) : null,
                sent_at: error ? null : new Date().toISOString(),
              });
            }
            if (!error) {
              dispatchedEmail += toSend.length;
            } else {
              emailFailures += toSend.length;
              emailFailureDetail.push(
                `rule=${rule.id} (${toSend.length}건): ${String(error).substring(0, 120)}`,
              );
            }
          } catch (e) {
            console.error(`[alert-dispatch] 이메일 발송 실패 rule=${rule.id}:`, e);
            emailFailures += toSend.length;
            emailFailureDetail.push(
              `rule=${rule.id} (${toSend.length}건): ${
                (e instanceof Error ? e.message : String(e)).substring(0, 120)
              }`,
            );
          }
        }
      } else {
        skipped += matches.length;
      }

      // ━━ 카카오 알림톡 (pro만) — sendAlimtalk stub 으로 호출 ━━
      // 발송 대행사 미정 시 sendAlimtalk 가 'skipped_no_provider' 반환 →
      // alert_deliveries 에 status='skipped' 로 기록. 운영자가 어드민에서 식별 가능.
      // 대행사 결정 후엔 lib/kakao-alimtalk.ts 의 sendAlimtalkLive 만 채우면 됨.
      if (canKakao) {
        // 수신 동의 게이트 — 카톡 동의 없으면 sendAlimtalk 호출 자체를 스킵하고
        // status='skipped', error='consent_missing' 으로 기록해 어드민에서 추적 가능.
        // 다음 cron 실행 시 사용자가 동의하면 자동으로 발송 재개됨.
        const consented = await getKakaoConsent(rule.user_id);
        const toSend = matches.filter((m) => !alreadyKakao.has(`${m.table}:${m.id}`));

        if (!consented) {
          for (const m of toSend) {
            await supabase.from("alert_deliveries").insert({
              rule_id: rule.id,
              user_id: rule.user_id,
              program_table: m.table,
              program_id: m.id,
              program_title: m.title,
              channel: "kakao",
              status: "skipped",
              error: "consent_missing",
              sent_at: null,
            });
            kakaoSkippedConsent++;
          }
        } else {
          for (const m of toSend) {
            // 상세 경로 — welfare/loan 테이블별로 keepioo 내부 상세 페이지 경로가 다름.
            // 카카오 템플릿 버튼은 도메인 고정(https://www.keepioo.com) + #{detail_path}
            // 변수로 등록돼 있어 경로만 전달. 심사 통과율을 위한 선택.
            const detailPath = m.table === "welfare_programs"
              ? `/welfare/${m.id}`
              : `/loan/${m.id}`;

            const result = await sendAlimtalk({
              phoneNumber: rule.phone_number!,
              templateCode: "POLICY_NEW",
              variables: {
                rule_name: rule.name,
                title: m.title,
                deadline: m.apply_end ?? "상시",
                detail_path: detailPath,
              },
            });

            // 결과 → alert_deliveries 행 (UNIQUE INDEX 가 중복 방지)
            let status: "sent" | "failed" | "skipped";
            let errorMsg: string | null = null;
            if (result.ok) {
              status = "sent";
            } else if (result.reason === "skipped_no_provider") {
              status = "skipped";
              errorMsg = "kakao_provider_not_configured";
            } else {
              status = "failed";
              errorMsg = `${result.reason}: ${result.error ?? ""}`.slice(0, 500);
            }

            await supabase.from("alert_deliveries").insert({
              rule_id: rule.id,
              user_id: rule.user_id,
              program_table: m.table,
              program_id: m.id,
              program_title: m.title,
              channel: "kakao",
              status,
              error: errorMsg,
              sent_at: result.ok ? new Date().toISOString() : null,
            });
            dispatchedKakao++;
          }
        }
      }
    }

    // 이메일 발송 실패가 1건이라도 있으면 운영자 알림.
    // 사용자에게 중요 알림이 못 간 상황은 조용히 넘어가면 안 됨.
    // P3-B dedupe 가 같은 (rule, error) 반복 시 24h 메일 1통만 유지.
    if (emailFailures > 0) {
      await notifyCronFailure(
        `${jobLabel} - 이메일 발송 실패 ${emailFailures}건`,
        emailFailureDetail.slice(0, 10).join("\n"),
      );
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      rules_processed: rules.length,
      dispatched_email: dispatchedEmail,
      email_failures: emailFailures,
      queued_kakao: dispatchedKakao,
      kakao_skipped_consent: kakaoSkippedConsent,
      skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await notifyCronFailure(jobLabel, message);
    return NextResponse.json({ error: "발송 실패", detail: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runAlertDispatch("alert-dispatch (POST)");
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runAlertDispatch("alert-dispatch (cron)");
}
