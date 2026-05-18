// ============================================================
// /api/cron/external-console-check — 외부 console 자동 점검 (Phase 3 자율 운영)
// ============================================================
// 매일 KST 09:30 cron 이 외부 시스템 점검 → 이상 시만 SMS.
// vercel.json: { "path": "/api/cron/external-console-check", "schedule": "30 0 * * *" }
//
// 현재 통합 (env 미설정 시 graceful skip):
//   - site-availability (즉시 가능, 외부 의존 0)
//   - kakao    (Solapi 발송 통계, env: SOLAPI_API_KEY/SECRET)
//   - toss     (DB subscriptions funnel, env: TOSS_SECRET_KEY ping)
//   - adsense  (AdSense Management API + OAuth refresh token)
//   - ga4      (Google Analytics Data API + OAuth)
//   - vercel   (Vercel REST API, env: VERCEL_TOKEN — prod 등록됨)
//   - supabase (Management API + advisor security, env: SUPABASE_PERSONAL_ACCESS_TOKEN)
//   - search_console (Search Analytics API, env: SC_SITE_URL/CLIENT_ID/SECRET/REFRESH_TOKEN)
//
// 새 console 추가 패턴: lib/external-console/<name>.ts 에 ConsoleCheckResult 반환
// 함수 작성 → 본 cron 의 checks 배열에 추가. SMS·이메일 통합은 기존 로직 재활용.
// ============================================================

import { NextResponse } from "next/server";
import { checkSiteAvailability } from "@/lib/external-console/site-availability";
import { checkKakao } from "@/lib/external-console/kakao";
import { checkToss } from "@/lib/external-console/toss";
import { checkAdsense } from "@/lib/external-console/adsense";
import { checkGa4 } from "@/lib/external-console/ga4";
import { checkVercel } from "@/lib/external-console/vercel";
import { checkSupabase } from "@/lib/external-console/supabase";
import { checkSearchConsole } from "@/lib/external-console/search-console";
import type { ConsoleCheckResult } from "@/lib/external-console/types";
import { sendOpsAlertMultichannel } from "@/lib/notifications/ops-alert-multichannel";
import { auditCronRun } from "@/lib/ops/audit-cron-run";
import {
  filterRecentlyAlertedKeys,
  recordAlertsSent,
} from "@/lib/external-console/alert-dedupe";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

async function run() {
  // 모든 점검 병렬 실행 — 한 console 실패가 다른 점검 막지 않게 settled.
  const checks: Array<Promise<ConsoleCheckResult>> = [
    checkSiteAvailability(),
    checkKakao(),
    checkToss(),
    checkAdsense(),
    checkGa4(),
    checkVercel(),
    checkSupabase(),
    checkSearchConsole(),
  ];
  const settled = await Promise.allSettled(checks);

  const results: ConsoleCheckResult[] = settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    return {
      console: `check_${i}_failed`,
      alerts: [
        {
          key: "checker_error",
          message: `점검 자체 실패: ${(s.reason as Error).message ?? "unknown"}`,
          recommendation: "/admin/health 또는 Vercel function logs 확인",
        },
      ],
      kpis: {},
      error: (s.reason as Error).message,
    };
  });

  const totalAlerts = results.flatMap((r) => r.alerts);

  // G7 (2026-05-17) — per-key 24h dedupe. 1주차 모니터링 결과 매일 동일 5종 alert
  // (site_slow / solapi_balance_low / ga4_no_traffic / supabase_advisor_warn / sc_fetch_failed)
  // 사장님 SMS 폭주 → 24h 내 발송된 key 는 skip. 새 key 만 발송.
  const { active: alertsToSend, suppressed } =
    await filterRecentlyAlertedKeys(totalAlerts);

  // 이상 1건 이상 + 24h 신규 key 가 있을 때만 SMS + 텔레그램 발송.
  // 2026-05-14 — sendOpsAlertMultichannel helper 로 단일 진입점 (Improvement-2 fix).
  // 잔액 0 사고 시 SMS 단절돼도 텔레그램으로 도달 보장.
  let multi: Awaited<ReturnType<typeof sendOpsAlertMultichannel>> | null = null;
  if (alertsToSend.length > 0) {
    const lines = alertsToSend.map((a) => {
      const rec = a.recommendation ? `\n  → ${a.recommendation}` : "";
      return `- [${a.key}] ${a.message}${rec}`;
    });
    const subject = `[keepioo 외부 점검] ${alertsToSend.length}건 신규 이상`;
    const message = lines.join("\n");
    multi = await sendOpsAlertMultichannel({ subject, message });

    // 발송 성공/실패 무관, 시도한 key 는 24h cooldown 기록 (실패 재시도 폭주 차단).
    await recordAlertsSent(alertsToSend.map((a) => a.key));
  }
  const smsResult = multi?.sms ?? null;
  const telegramResult = multi?.telegram ?? null;

  // 2026-05-18 — first-run baseline 알림 (cron 신규 가동·OAuth 등록 직후 정상 신호).
  // 조건: alerts 0 (모든 console 정상) AND 이전 7일 audit 0 (cron 신규 가동).
  // 효과: 사장님 "OAuth 등록 후 정상 가동 확인" 즉시. 이후 매일 무음 (변화 시만 알림).
  let firstRunAlerted = false;
  if (alertsToSend.length === 0 && totalAlerts.length === 0) {
    const admin = createAdminClient();
    const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { count } = await admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "external_console_check_run")
      .gte("created_at", since7d);
    if ((count ?? 0) === 0) {
      const activeConsoles = results
        .filter((r) => !r.error?.startsWith("skipped:"))
        .map((r) => r.console)
        .join(", ");
      await sendOpsAlertMultichannel({
        subject: "[keepioo] 외부 콘솔 통합 점검 정상 가동 ✓",
        message: [
          `external-console-check cron 신규 가동 — 모든 console 정상.`,
          `활성: ${activeConsoles}`,
          ``,
          `이후 매일 KST 09:30 자동 점검. 이상 시만 텔레그램 발송 (24h dedupe).`,
        ].join("\n"),
        link: "https://www.keepioo.com/admin/external-console",
      });
      firstRunAlerted = true;
    }
  }

  // 2026-05-14 — 사장님 가시성 audit (subagent Critical-1).
  // 핵심 KPI (balance_total/balance_cash/balance_point/site availability/vercel deploy 등) 가
  // 지금까지 vercel function logs 에만 있어 admin_actions 영구 저장 0 → autonomous hub metric 무력했음.
  // collect_run / press_ingest_run / alert_dispatch_run 패턴 일관 미러.
  // alerts/results/SMS/텔레그램 결과 모두 압축 — 사장님이 admin_actions query 만으로 진단 가능.
  await auditCronRun("external_console_check_run", {
    checked: results.length,
    alerts_total: totalAlerts.length,
    alert_keys: totalAlerts.map((a) => a.key),
    // G7 dedupe 가시성 — 사장님 진단성
    alerts_sent: alertsToSend.length,
    sent_keys: alertsToSend.map((a) => a.key),
    suppressed_keys: suppressed,
    // 각 console 별 alert·KPI 요약 (전체 KPI 본문은 details json 통째로 저장)
    results_summary: results.map((r) => ({
      console: r.console,
      alerts_count: r.alerts.length,
      alert_keys: r.alerts.map((a) => a.key),
      kpis: r.kpis,
      error: r.error,
    })),
    sms_ok: smsResult?.ok ?? null,
    sms_reason: smsResult?.ok === false ? smsResult.reason : undefined,
    telegram_ok: telegramResult?.ok ?? null,
    telegram_reason:
      telegramResult?.ok === false ? telegramResult.reason : undefined,
  });

  return NextResponse.json({
    ok: true,
    checked: results.length,
    alerts: totalAlerts.length,
    results,
    sms: smsResult,
    telegram: telegramResult,
    first_run_alerted: firstRunAlerted,
  });
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}

// 수동 trigger 편의
export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}
