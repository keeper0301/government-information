// ============================================================
// Web Push 구독 관리 (2026-05-19 spec)
// ============================================================
// push_subscriptions 테이블 CRUD. DDL 091 apply 후 가동.
// graceful: 미적용 DDL 시 모든 함수 noop · empty 반환.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type PushSubscription = {
  endpoint: string;
  p256dh: string;
  auth_key: string;
  user_agent?: string;
  user_id?: string | null;
};

export type StoredSubscription = PushSubscription & {
  id: string;
  created_at: string;
  last_sent_at: string | null;
};

export async function subscribeUser(
  sub: PushSubscription,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("push_subscriptions")
      .upsert(
        {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth_key: sub.auth_key,
          user_agent: sub.user_agent ?? null,
          user_id: sub.user_id ?? null,
        },
        { onConflict: "endpoint" },
      )
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function listSubscriptions(): Promise<StoredSubscription[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key, user_agent, user_id, created_at, last_sent_at");
    if (error || !data) return [];
    return data as StoredSubscription[];
  } catch {
    return [];
  }
}

// userId 전달 시 본인 row 만 삭제 (다른 사용자 endpoint 임의 삭제 차단).
// userId 미전달 (발송 cron 의 410/404 cleanup) 시 endpoint 만으로 삭제.
export async function removeSubscription(
  endpoint: string,
  userId?: string | null,
): Promise<void> {
  try {
    const admin = createAdminClient();
    let query = admin.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (userId) query = query.eq("user_id", userId);
    await query;
  } catch {
    // graceful
  }
}

// markSent 는 send.ts 의 last_sent_at update 로 대체 (5/27 Spec 3) — dead export 제거
