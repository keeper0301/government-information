// ============================================================
// 네이버 publish 통계 helper (5/17)
// ============================================================
// 사장님 PC 의 runner (Chrome Extension or playwright) 가 매분 발행 시도.
// naver_publish_audit table 의 result='success'/'fail'/'skipped' 분류 활용.
//
// 사용처:
// - autonomous hub NaverPublishCard (5/17 신규)
// - health-check naver_publish_failure alert 와 다른 진단 layer (시각화 vs 능동)
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type NaverPublishStats = {
  attempts24h: number; // success + fail (실 시도)
  success24h: number;
  fails24h: number;
  skipped24h: number; // 시간대·daily_cap·no_cookies·disabled·dry_run 등
  successRate24h: number; // % (attempts > 0 일 때만, 0~100)
  lastSuccessAt: string | null;
  hoursSinceLastSuccess: number;
  pendingEligible: number; // status='pending' AND attempt_count < 3
  status: "healthy" | "watch" | "stalled" | "idle";
};

export async function getNaverPublishStats(): Promise<NaverPublishStats> {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [success, fails, skipped, lastSuccess, pending] = await Promise.all([
    admin
      .from("naver_publish_audit")
      .select("*", { count: "exact", head: true })
      .gte("attempted_at", since24h)
      .eq("result", "success"),
    admin
      .from("naver_publish_audit")
      .select("*", { count: "exact", head: true })
      .gte("attempted_at", since24h)
      .eq("result", "fail"),
    admin
      .from("naver_publish_audit")
      .select("*", { count: "exact", head: true })
      .gte("attempted_at", since24h)
      .eq("result", "skipped"),
    admin
      .from("naver_publish_audit")
      .select("attempted_at")
      .eq("result", "success")
      .order("attempted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("naver_blog_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")
      .lt("attempt_count", 3),
  ]);

  const success24h = success.count ?? 0;
  const fails24h = fails.count ?? 0;
  const skipped24h = skipped.count ?? 0;
  const attempts24h = success24h + fails24h;
  const successRate24h =
    attempts24h > 0 ? Math.round((success24h / attempts24h) * 100) : 0;

  const lastSuccessAt = lastSuccess.data?.attempted_at ?? null;
  const hoursSinceLastSuccess = lastSuccessAt
    ? Math.round(
        (Date.now() - new Date(lastSuccessAt).getTime()) / 3600_000,
      )
    : 9999;

  const pendingEligible = pending.count ?? 0;

  // status — 4 case:
  // - idle: 시도 0 + 큐 0 → 정상 운영 가정 (사장님 PC 미가동 OR 큐 비어있음)
  // - healthy: 시도 있고 성공률 ≥ 70%
  // - watch: 시도 있고 성공률 30~70%
  // - stalled: 시도 있고 성공률 < 30% (5/13 사고 패턴 — Vercel IP 차단 / legacy runner)
  let status: NaverPublishStats["status"];
  if (attempts24h === 0 && pendingEligible === 0) {
    status = "idle";
  } else if (attempts24h === 0) {
    status = "watch"; // 큐는 있는데 시도 0 = PC 미가동 의심
  } else if (successRate24h >= 70) {
    status = "healthy";
  } else if (successRate24h >= 30) {
    status = "watch";
  } else {
    status = "stalled";
  }

  return {
    attempts24h,
    success24h,
    fails24h,
    skipped24h,
    successRate24h,
    lastSuccessAt,
    hoursSinceLastSuccess,
    pendingEligible,
    status,
  };
}
