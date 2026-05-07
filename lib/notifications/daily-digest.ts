// ============================================================
// 매일 아침 KPI 다이제스트 — 사장님 휴대폰 SMS 자동 발송
// ============================================================
// 매일 KST 08:00 cron 으로 어제 핵심 지표를 한 줄로 요약.
// 사장님이 어드민 들여다보지 않아도 "어제 운영 어떻게 굴러갔는지" 즉시 인지.
//
// SMS 90자 권장 — 가장 중요한 5~6 지표만:
//   - 어제 신규 가입
//   - 어제 새 정책 추가
//   - 7d 활성
//   - 광역 보도자료 자동 승인
//   - 자동 모더레이션 hide
//
// LMS (90자 초과) 로 자동 전환 시 비용 ~30원/일 = 월 ~900원.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type DigestData = {
  signups24h: number;
  newPolicies24h: number; // welfare + loan + naver-news 합계
  active7d: number;
  pressAutoConfirmed24h: number; // press_l2_confirm by actor=null
  newsAutoHidden24h: number;     // news_auto_hide by actor=null
  dedupeAutoConfirmed24h: number; // dedupe_auto_confirm by actor=null
};

/**
 * 어제 (24h 윈도우) KPI 데이터 수집.
 * 단일 page-rendering 비용 ~수 query — Promise.all 로 병렬.
 */
export async function collectDailyDigest(): Promise<DigestData> {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // 신규 가입 — admin-stats 패턴 (auth.users) 보다 user_profiles 가 더 안정적
  const [
    profileCount,
    welfareCount,
    loanCount,
    newsCount,
    activeProfiles,
    pressAuto,
    newsAutoHide,
    dedupeAuto,
  ] = await Promise.all([
    admin
      .from("user_profiles")
      .select("user_id", { count: "exact", head: true })
      .gte("created_at", since24h),
    admin
      .from("welfare_programs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24h),
    admin
      .from("loan_programs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24h),
    admin
      .from("news_posts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24h),
    admin
      .from("user_profiles")
      .select("user_id", { count: "exact", head: true })
      .gte("updated_at", since7d),
    admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "press_l2_confirm")
      .is("actor_id", null)
      .gte("created_at", since24h),
    admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "news_auto_hide")
      .gte("created_at", since24h),
    admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "dedupe_auto_confirm")
      .gte("created_at", since24h),
  ]);

  const newPolicies24h =
    (welfareCount.count ?? 0) + (loanCount.count ?? 0) + (newsCount.count ?? 0);

  return {
    signups24h: profileCount.count ?? 0,
    newPolicies24h,
    active7d: activeProfiles.count ?? 0,
    pressAutoConfirmed24h: pressAuto.count ?? 0,
    newsAutoHidden24h: newsAutoHide.count ?? 0,
    dedupeAutoConfirmed24h: dedupeAuto.count ?? 0,
  };
}

/**
 * 사장님 SMS 본문 — SMS 90자 안에 들어가도록 압축.
 * 가독성 우선: 줄바꿈으로 시각 구분, 숫자만 빠르게 인지.
 */
export function formatDigestMessage(data: DigestData): string {
  const date = new Date();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return [
    `[keepioo ${mm}/${dd}]`,
    `가입 ${data.signups24h} · 활성 ${data.active7d}`,
    `신규 정책 ${data.newPolicies24h}건`,
    `자동: 보도자료 ${data.pressAutoConfirmed24h}, 뉴스hide ${data.newsAutoHidden24h}, dedupe ${data.dedupeAutoConfirmed24h}`,
    `→ keepioo.com/admin/health`,
  ].join("\n");
}
