// ============================================================
// /api/cron/external-console-check — 외부 console 자동 점검 (Phase 3 자율 운영)
// ============================================================
// 매일 KST 09:30 cron 이 외부 시스템 점검 → 이상 시만 SMS.
// vercel.json: { "path": "/api/cron/external-console-check", "schedule": "30 0 * * *" }
//
// 현재 통합:
//   - site-availability (즉시 가능, 외부 의존 0)
//
// 다음 통합 (사장님 외부 액션 후):
//   - adsense (Google AdSense Management API + OAuth refresh token)
//   - kakao (카카오 비즈 콘솔 API or chrome 자동화)
//   - toss (토스 결제 API)
//   - ga4 (Google Analytics Data API + OAuth)
//
// 새 console 추가 패턴: lib/external-console/<name>.ts 에 ConsoleCheckResult 반환
// 함수 작성 → 본 cron 의 Promise.all 에 추가. SMS·이메일 통합은 기존 로직 재활용.
// ============================================================

import { NextResponse } from "next/server";
import { checkSiteAvailability } from "@/lib/external-console/site-availability";
import { checkKakao } from "@/lib/external-console/kakao";
import { checkToss } from "@/lib/external-console/toss";
import { checkAdsense } from "@/lib/external-console/adsense";
import type { ConsoleCheckResult } from "@/lib/external-console/types";
import { sendOpsAlertSms } from "@/lib/notifications/sms-ops-alert";

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
    // 다음 통합 시 여기에 추가:
    // checkGa4()
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

  // 이상 1건 이상이면 SMS 발송. 정상이면 SMS 안 보냄 (noise 0).
  let smsResult: Awaited<ReturnType<typeof sendOpsAlertSms>> | null = null;
  if (totalAlerts.length > 0) {
    const lines = totalAlerts.map((a) => {
      const rec = a.recommendation ? `\n  → ${a.recommendation}` : "";
      return `- [${a.key}] ${a.message}${rec}`;
    });
    try {
      smsResult = await sendOpsAlertSms({
        subject: `[keepioo 외부 점검] ${totalAlerts.length}건 이상`,
        message: lines.join("\n"),
      });
    } catch (e) {
      smsResult = {
        ok: false,
        reason: "network_error",
        error: (e as Error).message,
      };
    }
  }

  return NextResponse.json({
    ok: true,
    checked: results.length,
    alerts: totalAlerts.length,
    results,
    sms: smsResult,
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
