// ============================================================
// /api/cron/naver-extension-idle-reminder — Naver Extension 1주 미가동 reminder
// ============================================================
// 5/13 Extension 코드 push 후 사장님 액션 3건 (설치·secret·dry-run) 미완.
// 5/18 진단 메모리 [naver-extension-1week-idle] 자동화 — 매주 일요일 09:00.
//
// 조건: 최근 7일 admin_actions.naver_publish_* 0건 = 사장님 액션 미완.
// 알림: 텔레그램+SMS 1회. 가동 시작 시 자동 무음 (audit row 발생 시 hide).
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOpsAlertMultichannel } from "@/lib/notifications/ops-alert-multichannel";
import { logAdminAction, type AdminActionType } from "@/lib/admin-actions";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function run() {
  const admin = createAdminClient();
  // 2026-05-31 — schedule 주 1 → 매일. 단 noise 방지 위해 5일+ idle 시 + 7/14/21/...
  // 일수 단위 도달 시만 발화. 그 사이 일은 audit 만 (hub UI 가 일수 가시화).
  const since30d = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();

  // 최근 30일 마지막 가동 audit 찾기 (없으면 30+ days idle).
  const { data: lastRow } = await admin
    .from("admin_actions")
    .select("created_at")
    .in("action", [
      "naver_publish_success",
      "naver_publish_fail",
      "naver_extension_publish",
      "naver_cookies_uploaded",
    ])
    .gte("created_at", since30d)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // daysIdle: 마지막 가동 시점부터 일수. row 없으면 30+ (capped).
  const daysIdle = lastRow?.created_at
    ? Math.floor(
        (Date.now() - new Date(lastRow.created_at).getTime()) /
          (24 * 3600_000),
      )
    : 30;
  const idle = daysIdle >= 5;
  // 7/14/21/28/30 일 단위 마일스톤 도달 시만 발화 (noise ↓).
  const milestone =
    daysIdle === 7 || daysIdle === 14 || daysIdle === 21 || daysIdle >= 28;
  let alerted = false;

  if (idle && milestone) {
    await sendOpsAlertMultichannel({
      subject: `[keepioo] Naver Extension ${daysIdle}일째 가동 0 ⚠️`,
      message: [
        `Naver Extension 마지막 가동 후 ${daysIdle}일 경과. 매일 hub 자동 점검.`,
        ``,
        `[사장님 액션 3건] (예상 10분)`,
        `1. Chrome Extension 설치 (메모리 [naver-extension-desktop-setup])`,
        `2. popup 에서 secret 입력`,
        `3. /admin/naver-blog manual-test 에서 dry-run 1건 검증`,
        ``,
        `설치 후 cron 자동 무음 전환 (5일 미만 idle 시 알림 X).`,
      ].join("\n"),
      link: "https://github.com/keeper0301/government-information/blob/master/chrome-extension/README.md",
    });
    alerted = true;
  }

  await logAdminAction({
    actorId: null,
    action: "naver_extension_idle_check" as AdminActionType,
    details: {
      idle,
      days_idle: daysIdle,
      milestone,
      alerted,
    },
  });

  return NextResponse.json({
    ok: true,
    idle,
    days_idle: daysIdle,
    milestone,
    alerted,
  });
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}

export async function POST(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}
