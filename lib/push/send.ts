// ============================================================
// PWA 푸시 발송 (Spec 3-A)
// ============================================================
// web-push.sendNotification + push_notification_log row insert + 410/404 cleanup.
// VAPID 키는 Vercel env (NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY + VAPID_SUBJECT).
// ============================================================

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeSubscription } from "./subscribe";

export type PushPayload = {
  title: string;
  body: string;
  url: string; // 클릭 시 이동 (절대 경로)
  tag?: string;
  icon?: string;
  badge?: string;
};

let _vapidConfigured = false;

function configureVapid(): void {
  if (_vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("VAPID env missing (NEXT_PUBLIC_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT)");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  _vapidConfigured = true;
}

// 현재 KST hour (0~23)
function nowHourKst(): number {
  const utc = new Date();
  const kst = new Date(utc.getTime() + 9 * 3600_000);
  return kst.getUTCHours();
}

// status 분류 — web-push error.statusCode 기반
function classifyError(err: unknown): {
  status: "failed_410" | "failed_404" | "failed_other";
  message: string;
} {
  const e = err as { statusCode?: number; message?: string };
  if (e?.statusCode === 410) return { status: "failed_410", message: e.message ?? "Gone" };
  if (e?.statusCode === 404) return { status: "failed_404", message: e.message ?? "Not Found" };
  return { status: "failed_other", message: e?.message ?? String(err) };
}

type SubscriptionInput = {
  id: string;
  user_id: string | null;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

export type SendResult = {
  subscription_endpoint: string;
  status: "success" | "failed_410" | "failed_404" | "failed_other";
  error?: string;
  logId?: number;
};

// 단일 subscription 에 발송 + log insert + 410/404 시 cleanup.
// log_id 가 payload.data 에 포함되어 sw 의 notificationclick 에서 추적 endpoint 호출.
export async function sendPushToSubscription(
  sub: SubscriptionInput,
  payload: PushPayload,
): Promise<SendResult> {
  configureVapid();
  const admin = createAdminClient();
  const sentHourKst = nowHourKst();

  // 1) log row 먼저 insert — id 를 payload.data 에 포함시키기 위해.
  //    발송 실패 시 status update 로 변경.
  const { data: logRow, error: insertErr } = await admin
    .from("push_notification_log")
    .insert({
      user_id: sub.user_id,
      subscription_endpoint: sub.endpoint,
      payload,
      sent_hour_kst: sentHourKst,
      send_status: "success", // 초기값, 실패 시 update
    })
    .select("id")
    .single();

  if (insertErr || !logRow) {
    return {
      subscription_endpoint: sub.endpoint,
      status: "failed_other",
      error: `log_insert_failed: ${insertErr?.message ?? "unknown"}`,
    };
  }

  // 2) web-push 발송 — payload.data 에 logId 포함 (sw 가 클릭 시 사용)
  const wpPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag ?? "keepioo-policy",
    icon: payload.icon ?? "/icon.svg",
    badge: payload.badge ?? "/icon.svg",
    logId: logRow.id,
  });

  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth_key },
      },
      wpPayload,
    );
    // 3a) success — push_subscriptions.last_sent_at update (옵션)
    await admin
      .from("push_subscriptions")
      .update({ last_sent_at: new Date().toISOString() })
      .eq("endpoint", sub.endpoint);
    return {
      subscription_endpoint: sub.endpoint,
      status: "success",
      logId: logRow.id,
    };
  } catch (err) {
    const { status, message } = classifyError(err);
    // 3b) 실패 — log row 의 send_status update
    await admin
      .from("push_notification_log")
      .update({ send_status: status, send_error: message })
      .eq("id", logRow.id);
    // 410/404 — 만료된 endpoint 정리 (자연 cleanup)
    if (status === "failed_410" || status === "failed_404") {
      await removeSubscription(sub.endpoint);
    }
    return {
      subscription_endpoint: sub.endpoint,
      status,
      error: message,
      logId: logRow.id,
    };
  }
}

// 사용자의 모든 활성 subscription 에 같은 payload 발송 (multi-device).
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<SendResult[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key")
    .eq("user_id", userId);
  if (error || !data || data.length === 0) return [];
  const results: SendResult[] = [];
  for (const sub of data as SubscriptionInput[]) {
    results.push(await sendPushToSubscription(sub, payload));
  }
  return results;
}
