// ============================================================
// /admin/health 통합 헬스 dashboard 데이터 헬퍼
// ============================================================
// 매일 첫 페이지로 사용 — 운영 부담 ↓ 결정적.
// DB·cron·콘텐츠·환경변수·외부 서비스 한 곳에서 한눈에.
//
// 항목:
//   1. DB row counts (welfare/loan/news/blog/users)
//   2. cron 24h 실패·blog 24h 발행
//   3. 환경변수 필수 set 여부 (KAKAO·GA4·AdSense 등)
//   4. 마이그레이션 누적 (적용된 최신 버전)
//   5. 활성 사용자 (7일·24h)
//   6. 마지막 데이터 갱신 (welfare/loan/news max created_at)
// ============================================================

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUsersCached } from "@/lib/admin-stats";

export type HealthCheckItem = {
  label: string;
  value: string;
  status: "ok" | "warn" | "error" | "info";
  hint?: string;
};

export type HealthSnapshot = {
  db: HealthCheckItem[];
  cron: HealthCheckItem[];
  content: HealthCheckItem[];
  env: HealthCheckItem[];
  users: HealthCheckItem[];
};

// 필수 환경변수 — 누락 시 운영 영향
const REQUIRED_ENV = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", desc: "Supabase URL" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", desc: "Supabase anon key" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", desc: "Supabase service role" },
  { key: "CRON_SECRET", desc: "cron 인증" },
  { key: "ADMIN_EMAILS", desc: "어드민 권한" },
  { key: "NEXT_PUBLIC_GA_ID", desc: "GA4 측정 ID" },
  { key: "NEXT_PUBLIC_ADSENSE_ID", desc: "AdSense 클라이언트 ID" },
  { key: "RESEND_API_KEY", desc: "이메일 발송" },
  // 선택 (카카오 알림톡, 심사 통과 후 set 예상)
  { key: "KAKAO_ALIMTALK_PROVIDER", desc: "카카오 알림톡 (선택)", optional: true },
  { key: "SOLAPI_API_KEY", desc: "Solapi API (선택)", optional: true },
] as const;

export const getHealthSnapshot = cache(async (): Promise<HealthSnapshot> => {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 병렬 fetch — round trip 최소화
  const [
    welfareCount,
    loanCount,
    newsCount,
    blogPublishedCount,
    blog24h,
    cron24h,
    welfareLatest,
    loanLatest,
    newsLatest,
    users,
  ] = await Promise.all([
    admin.from("welfare_programs").select("id", { count: "exact", head: true }),
    admin.from("loan_programs").select("id", { count: "exact", head: true }),
    admin.from("news_posts").select("id", { count: "exact", head: true }),
    admin
      .from("blog_posts")
      .select("id", { count: "exact", head: true })
      .not("published_at", "is", null),
    admin
      .from("blog_posts")
      .select("id", { count: "exact", head: true })
      .gte("published_at", since24h),
    admin
      .from("cron_failure_log")
      .select("id", { count: "exact", head: true })
      .gte("notified_at", since24h),
    admin
      .from("welfare_programs")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("loan_programs")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("news_posts")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getAuthUsersCached(),
  ]);

  // 활성 사용자 카운트 — last_sign_in_at 기준
  const usersTotal = users.length;
  const active7d = users.filter(
    (u) => u.last_sign_in_at && u.last_sign_in_at > since7d,
  ).length;
  const active24h = users.filter(
    (u) => u.last_sign_in_at && u.last_sign_in_at > since24h,
  ).length;
  const signups24h = users.filter((u) => u.created_at > since24h).length;

  // 분 단위 경과
  const minutesAgo = (iso: string | null | undefined): string => {
    if (!iso) return "—";
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (m < 1) return "방금 전";
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}시간 전`;
    return `${Math.floor(h / 24)}일 전`;
  };

  // 환경변수 체크 — server side process.env. NEXT_PUBLIC_ 도 동일하게 set 여부만.
  const envItems: HealthCheckItem[] = REQUIRED_ENV.map((e) => {
    const set = !!process.env[e.key];
    const optional = "optional" in e && e.optional;
    return {
      label: e.key,
      value: set ? "set" : optional ? "선택 — 미설정" : "❌ 누락",
      status: set ? "ok" : optional ? "info" : "error",
      hint: e.desc,
    };
  });

  return {
    db: [
      {
        label: "복지 정책",
        value: `${(welfareCount.count ?? 0).toLocaleString()}건`,
        status: "ok",
      },
      {
        label: "대출·정책자금",
        value: `${(loanCount.count ?? 0).toLocaleString()}건`,
        status: "ok",
      },
      {
        label: "정책 뉴스",
        value: `${(newsCount.count ?? 0).toLocaleString()}건`,
        status: "ok",
      },
      {
        label: "블로그 발행",
        value: `${(blogPublishedCount.count ?? 0).toLocaleString()}글`,
        status: "ok",
      },
      {
        label: "마지막 welfare 추가",
        value: minutesAgo(welfareLatest.data?.created_at),
        status: "info",
      },
      {
        label: "마지막 loan 추가",
        value: minutesAgo(loanLatest.data?.created_at),
        status: "info",
      },
      {
        label: "마지막 news 추가",
        value: minutesAgo(newsLatest.data?.created_at),
        status: "info",
      },
    ],
    cron: [
      {
        label: "cron 실패 24h",
        value: `${cron24h.count ?? 0}건`,
        status: (cron24h.count ?? 0) === 0 ? "ok" : (cron24h.count ?? 0) >= 3 ? "error" : "warn",
        hint: (cron24h.count ?? 0) >= 3 ? "/admin/cron-failures 점검" : undefined,
      },
      {
        label: "blog 24h 발행",
        value: `${blog24h.count ?? 0}글`,
        status: (blog24h.count ?? 0) >= 5 ? "ok" : (blog24h.count ?? 0) >= 1 ? "warn" : "error",
        hint: (blog24h.count ?? 0) === 0 ? "publish-blog cron 점검 필요" : undefined,
      },
    ],
    content: [],
    env: envItems,
    users: [
      {
        label: "총 사용자",
        value: `${usersTotal.toLocaleString()}명`,
        status: "info",
      },
      {
        label: "7일 활성",
        value: `${active7d.toLocaleString()}명`,
        status: active7d >= 5 ? "ok" : "info",
      },
      {
        label: "24h 활성",
        value: `${active24h.toLocaleString()}명`,
        status: active24h >= 1 ? "ok" : "info",
      },
      {
        label: "24h 신규 가입",
        value: `${signups24h.toLocaleString()}명`,
        status: signups24h >= 1 ? "ok" : "info",
        hint: signups24h === 0 ? "트래픽 부족 — AdSense·SEO 가속" : undefined,
      },
    ],
  };
});
