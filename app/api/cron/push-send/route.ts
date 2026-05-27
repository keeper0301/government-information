// ============================================================
// /api/cron/push-send — PWA 푸시 발송 (Spec 3-A)
// ============================================================
// 매시 0분 가동 (Vercel cron `0 * * * *`). 활성 subscriber 중
// 현재 KST hour 가 preferred_hours 에 포함되는 사용자에게 발송.
//
// 가드:
//   - 1회/일 cap (last 23h 안에 success 발송 있으면 skip)
//   - VAPID env 없으면 fail (graceful 502)
//   - subscriber 0 → 즉시 OK 종료
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-actions";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { auditCronRun } from "@/lib/ops/audit-cron-run";
import { sendPushToSubscription, type PushPayload } from "@/lib/push/send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_HOURS = [9, 12, 18];

function nowHourKst(): number {
  const utc = new Date();
  return new Date(utc.getTime() + 9 * 3600_000).getUTCHours();
}

type SubscriberRow = {
  id: string;
  user_id: string | null;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

async function run() {
  const admin = createAdminClient();
  const hourKst = nowHourKst();
  const since23h = new Date(Date.now() - 23 * 3600_000).toISOString();

  // 1) 활성 subscriber + user pref
  const { data: subs, error: subErr } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key")
    .not("user_id", "is", null);

  if (subErr) {
    return {
      success: false,
      reason: `subscribe_query_failed: ${subErr.message}`,
      sent: 0,
      skipped: 0,
      failed: 0,
    };
  }
  const subscribers = (subs ?? []) as SubscriberRow[];
  if (subscribers.length === 0) {
    return {
      success: true,
      reason: "no_subscribers",
      hour_kst: hourKst,
      sent: 0,
      skipped: 0,
      failed: 0,
    };
  }

  // 2) 사용자별 preferred_hours 일괄 조회
  const userIds = Array.from(new Set(subscribers.map((s) => s.user_id).filter(Boolean))) as string[];
  const { data: prefs } = await admin
    .from("push_user_preferences")
    .select("user_id, preferred_hours")
    .in("user_id", userIds);
  const prefByUser = new Map<string, number[]>();
  for (const row of (prefs ?? []) as { user_id: string; preferred_hours: number[] }[]) {
    prefByUser.set(row.user_id, row.preferred_hours);
  }

  // 3) 사용자별 24h cap 확인
  const { data: recentLogs } = await admin
    .from("push_notification_log")
    .select("user_id")
    .eq("send_status", "success")
    .gte("sent_at", since23h)
    .in("user_id", userIds);
  const userSentRecently = new Set<string>(
    ((recentLogs ?? []) as { user_id: string }[]).map((r) => r.user_id),
  );

  // 4) 발송 대상 필터링 → 발송
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const eligibleEndpoints: string[] = [];

  // 스켈레톤 payload — 향후 user_alert_rules / user_policy_inbox_items 매칭으로 개선.
  // 5/27 단계: 발송 cron + 시점 학습 동작 검증이 우선.
  const payload: PushPayload = {
    title: "키피오 정책 알림",
    body: "오늘의 새 정책 매칭을 확인해보세요",
    url: "/mypage",
  };

  for (const sub of subscribers) {
    if (!sub.user_id) {
      skipped += 1;
      continue;
    }
    const hours = prefByUser.get(sub.user_id) ?? DEFAULT_HOURS;
    if (!hours.includes(hourKst)) {
      skipped += 1;
      continue;
    }
    if (userSentRecently.has(sub.user_id)) {
      skipped += 1;
      continue;
    }
    eligibleEndpoints.push(sub.endpoint);
    const result = await sendPushToSubscription(sub, payload);
    if (result.status === "success") {
      sent += 1;
      userSentRecently.add(sub.user_id); // 같은 사이클 내 multi-device 시 1번만
    } else {
      failed += 1;
    }
  }

  return {
    success: true,
    hour_kst: hourKst,
    total_subscribers: subscribers.length,
    eligible: eligibleEndpoints.length,
    sent,
    skipped,
    failed,
  };
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  const result = await run();

  await logAdminAction({
    actorId: null,
    action: "push_send_run",
    details: result,
  });
  await auditCronRun("push_send_run", {
    success: result.success,
    sent: result.sent,
    skipped: result.skipped,
    failed: result.failed,
    error: result.success ? undefined : result.reason,
  });
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export async function POST(request: Request) {
  return GET(request);
}
