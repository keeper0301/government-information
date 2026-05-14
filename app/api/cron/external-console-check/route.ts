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
import { sendOpsAlertSms } from "@/lib/notifications/sms-ops-alert";
import { sendOpsAlertTelegram } from "@/lib/notifications/telegram-ops-alert";
import { logAdminAction } from "@/lib/admin-actions";

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

  // 이상 1건 이상이면 SMS + 텔레그램 둘 다 발송 (이중 안전).
  // 2026-05-14 — 텔레그램 fallback 추가 (subagent Critical-1):
  // 본 cron 이 solapi_balance_low alert 잡아도 SMS 자체가 잔액 의존 →
  // 잔액 0 사고 시 alert 단절. 텔레그램은 무관 (Telegram Bot API).
  // health-alert (commit f6ad1ef) 와 동일 패턴.
  let smsResult: Awaited<ReturnType<typeof sendOpsAlertSms>> | null = null;
  let telegramResult: Awaited<ReturnType<typeof sendOpsAlertTelegram>> | null = null;
  if (totalAlerts.length > 0) {
    const lines = totalAlerts.map((a) => {
      const rec = a.recommendation ? `\n  → ${a.recommendation}` : "";
      return `- [${a.key}] ${a.message}${rec}`;
    });
    const subject = `[keepioo 외부 점검] ${totalAlerts.length}건 이상`;
    const message = lines.join("\n");

    try {
      smsResult = await sendOpsAlertSms({ subject, message });
    } catch (e) {
      smsResult = {
        ok: false,
        reason: "network_error",
        error: (e as Error).message,
      };
    }

    try {
      telegramResult = await sendOpsAlertTelegram({ subject, message });
    } catch (e) {
      telegramResult = {
        ok: false,
        reason: "network_error",
        error: (e as Error).message,
      };
    }
  }

  // 2026-05-14 — 사장님 가시성 audit (subagent Critical-1).
  // 핵심 KPI (balance_total/balance_cash/balance_point/site availability/vercel deploy 등) 가
  // 지금까지 vercel function logs 에만 있어 admin_actions 영구 저장 0 → autonomous hub metric 무력했음.
  // collect_run / press_ingest_run / alert_dispatch_run 패턴 일관 미러.
  // alerts/results/SMS/텔레그램 결과 모두 압축 — 사장님이 admin_actions query 만으로 진단 가능.
  try {
    await logAdminAction({
      actorId: null,
      action: "external_console_check_run",
      details: {
        checked: results.length,
        alerts_total: totalAlerts.length,
        alert_keys: totalAlerts.map((a) => a.key),
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
      },
    });
  } catch (e) {
    console.warn("[external-console-check] audit 실패:", (e as Error).message);
    // audit 실패는 응답 유지 (운영 안전성)
  }

  return NextResponse.json({
    ok: true,
    checked: results.length,
    alerts: totalAlerts.length,
    results,
    sms: smsResult,
    telegram: telegramResult,
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
