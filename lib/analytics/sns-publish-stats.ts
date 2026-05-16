// ============================================================
// SNS 발행 현황 통계 (B 2차)
// ============================================================
// 지난 30일 admin_actions 에서 5 채널 발행 결과 집계 →
// autonomous hub SnsPublishCard 카드 원본 데이터.
//
// 집계 source:
//   - sns_publish_run (blog → twitter/facebook/threads)
//   - sns_publish_popular_policy_run (인기 정책 → twitter/facebook/threads)
//   - instagram_publish_success / instagram_publish_fail
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type SnsChannelStat = {
  channel: string; // twitter / facebook / threads / instagram
  ok: number;
  fail: number;
  topFailReason: string | null;
};

export type SnsPublishStats = {
  windowDays: number;
  totalPosts: number; // 발행 건수 (정책 + blog 합)
  channels: SnsChannelStat[];
};

export async function getSnsPublishStats(
  windowDays: number = 30,
): Promise<SnsPublishStats> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - windowDays * 24 * 3600_000).toISOString();

  // 1) 채널 dispatch (twitter/facebook/threads) — blog + 인기 정책 합
  const { data: dispatchRows } = await admin
    .from("admin_actions")
    .select("action, details")
    .in("action", ["sns_publish_run", "sns_publish_popular_policy_run"])
    .gte("created_at", since);

  // 2) 인스타 success/fail audit
  const { data: instaRows } = await admin
    .from("admin_actions")
    .select("action, details")
    .in("action", ["instagram_publish_success", "instagram_publish_fail"])
    .gte("created_at", since);

  // 3) 집계 — 채널별 ok/fail count + 가장 빈번한 fail reason
  const stats = new Map<
    string,
    { ok: number; fail: number; reasons: Map<string, number> }
  >();
  function record(channel: string, ok: boolean, reason: string | null) {
    const s = stats.get(channel) ?? {
      ok: 0,
      fail: 0,
      reasons: new Map<string, number>(),
    };
    if (ok) s.ok += 1;
    else {
      s.fail += 1;
      const key = reason ?? "unknown";
      s.reasons.set(key, (s.reasons.get(key) ?? 0) + 1);
    }
    stats.set(channel, s);
  }

  let totalPosts = 0;
  for (const r of (dispatchRows ?? []) as Array<{
    action: string;
    details?: { channels?: Array<{ channel: string; ok: boolean; reason?: string }> } | null;
  }>) {
    totalPosts += 1;
    const channels = r.details?.channels ?? [];
    for (const c of channels) record(c.channel, c.ok, c.reason ?? null);
  }

  // instagram audit 패턴 — success 1건 = ok+1, fail 1건 = fail+1
  for (const r of (instaRows ?? []) as Array<{
    action: string;
    details?: { reason?: string } | null;
  }>) {
    const ok = r.action === "instagram_publish_success";
    record("instagram", ok, r.details?.reason ?? null);
  }

  // 채널 array 정렬 — 발행 빈도 ↓ 순
  const channels: SnsChannelStat[] = [...stats.entries()]
    .map(([channel, s]) => {
      const topReason = [...s.reasons.entries()].sort(
        (a, b) => b[1] - a[1],
      )[0];
      return {
        channel,
        ok: s.ok,
        fail: s.fail,
        topFailReason: topReason ? topReason[0] : null,
      };
    })
    .sort((a, b) => b.ok + b.fail - (a.ok + a.fail));

  return { windowDays, totalPosts, channels };
}
