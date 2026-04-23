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

export const maxDuration = 300; // 5분

type UserEmailRow = { id: string; email: string | null };

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

    // 2) 사용자 이메일 일괄 조회 (auth.users)
    const userIds = Array.from(new Set(rules.map((r) => r.user_id)));
    const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emailByUserId = new Map<string, string>();
    for (const u of users?.users || []) {
      if (u.id && u.email) emailByUserId.set(u.id, u.email);
    }

    let dispatchedEmail = 0;
    let dispatchedKakao = 0;
    let skipped = 0;
    let emailFailures = 0;
    const emailFailureDetail: string[] = [];

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

      // ━━ 카카오 알림톡 (pro만) — 구현은 Phase 4 에서 ━━
      if (canKakao) {
        // TODO: lib/kakao-alimtalk.ts 완성 후 호출
        // 현재는 큐 상태만 기록
        const toSend = matches.filter((m) => !alreadyKakao.has(`${m.table}:${m.id}`));
        for (const m of toSend) {
          await supabase.from("alert_deliveries").insert({
            rule_id: rule.id,
            user_id: rule.user_id,
            program_table: m.table,
            program_id: m.id,
            program_title: m.title,
            channel: "kakao",
            status: "queued",
            sent_at: null,
          });
          dispatchedKakao++;
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
