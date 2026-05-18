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

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

async function run() {
  const admin = createAdminClient();
  const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

  const { count } = await admin
    .from("admin_actions")
    .select("id", { count: "exact", head: true })
    .in("action", [
      "naver_publish_success",
      "naver_publish_fail",
      "naver_extension_publish",
      "naver_cookies_uploaded",
    ])
    .gte("created_at", since7d);

  const idle = (count ?? 0) === 0;
  let alerted = false;

  if (idle) {
    await sendOpsAlertMultichannel({
      subject: "[keepioo] Naver Extension 1주 가동 0건 ⚠️",
      message: [
        `최근 7일 Naver Extension audit 0건 감지.`,
        ``,
        `[사장님 액션 3건]`,
        `1. Chrome Extension 설치 (메모리 [naver-extension-desktop-setup])`,
        `2. popup 에서 secret 입력`,
        `3. /admin/naver-blog manual-test 에서 dry-run 1건 검증`,
        ``,
        `설치 완료 후 매주 일요일 09:00 자동 가동 검증 cron 무음 전환.`,
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
      audit_count_7d: count ?? 0,
      alerted,
    },
  });

  return NextResponse.json({
    ok: true,
    idle,
    audit_count_7d: count ?? 0,
    alerted,
  });
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}

export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}
