// ============================================================
// /admin — 운영자 허브 대시보드
// ============================================================
// 사이트 전반을 한눈에 — 지표 카드·빠른 액션 그리드·최근 활동 목록.
//
// 역할:
//   1. 최근 24시간 핵심 지표 6종 (가입·구독·알림·뉴스·AI·공고)
//   2. 사용자 조회 입력 폼 (기존 기능 유지)
//   3. 빠른 액션 링크 그리드 (하위 관리 페이지 진입점)
//   4. 최근 활동 목록 (신규 가입 5건 + 내 관리자 액션 5건)
//
// 권한:
//   - 비로그인 → /login?next=/admin
//   - 어드민 아니면 → /
//   - ADMIN_EMAILS 환경변수에 이메일 포함돼야 함 (lib/admin-auth.ts)
// ============================================================

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import {
  getActorActionsPaged,
  ACTION_LABELS,
} from "@/lib/admin-actions";
import {
  getSummaryKpi,
  getDailySignups,
  getDailyRevenueEstimated,
  getRecentPayments,
  getAuthUsersCached,
} from "@/lib/admin-stats";
import { Sparkline } from "@/components/admin/sparkline";
import { TIER_NAMES } from "@/lib/subscription";

export const metadata: Metadata = {
  title: "어드민 대시보드 | 정책알리미",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// 권한 가드
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

// 사용자 검색 server action — 기존 동작 유지
async function searchUser(formData: FormData) {
  "use server";
  const raw = String(formData.get("query") ?? "").trim();
  if (!raw) return;

  const admin = createAdminClient();
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(raw)) {
    redirect(`/admin/users/${raw}`);
  }

  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error || !data) {
    redirect(`/admin?error=${encodeURIComponent("조회 실패: " + (error?.message ?? "알수없음"))}`);
  }
  const found = data.users.find((u) => u.email?.toLowerCase() === raw.toLowerCase());
  if (!found) {
    redirect(`/admin?error=${encodeURIComponent("일치하는 사용자 없음: " + raw)}`);
  }
  redirect(`/admin/users/${found.id}`);
  revalidatePath("/admin");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 24시간 지표 집계 — 한 번의 Promise.all 로 병렬 수집
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function get24hStats() {
  const admin = createAdminClient();
  const nowMs = Date.now();
  const since24hIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
  const kstToday = new Date(nowMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    profilesCount,
    activeSubsCount,
    alertsSent,
    alertsFailed,
    alertsSkipped,
    newsCount,
    welfareCount,
    loanCount,
    aiUsageRows,
    cronAlertsNew,
  ] = await Promise.all([
    // 신규 가입 — user_profiles 기준. 온보딩 스킵 시 생성 안 될 수도 있어
    // 실사용자 대비 하회할 수 있지만, 실제 회원가입 퍼널 통과 사용자만 카운트.
    admin
      .from("user_profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24hIso),
    // 활성 구독 — basic/pro 중 trialing/active/charging/manual_grant
    admin
      .from("subscriptions")
      .select("user_id", { count: "exact", head: true })
      .in("tier", ["basic", "pro"])
      .in("status", ["trialing", "active", "charging", "manual_grant"]),
    // 알림 발송 — status 3종 분리 카운트.
    // 성공은 수치 자체가 의미, 실패·건너뜀은 운영 개입 신호 (템플릿 거절·동의 철회 등).
    admin
      .from("alert_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("created_at", since24hIso),
    admin
      .from("alert_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", since24hIso),
    admin
      .from("alert_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("status", "skipped")
      .gte("created_at", since24hIso),
    // 뉴스 수집
    admin
      .from("news_posts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24hIso),
    // 공고 수집 (welfare + loan 따로 조회 후 합산)
    admin
      .from("welfare_programs")
      .select("id", { count: "exact", head: true })
      .gte("fetched_at", since24hIso),
    admin
      .from("loan_programs")
      .select("id", { count: "exact", head: true })
      .gte("fetched_at", since24hIso),
    // AI 상담 — 오늘(KST) 전체 사용자 합산. 호출 1회당 count +1.
    admin.from("ai_usage_log").select("count").eq("date", kstToday),
    // cron 실패 알림 — 24h 신규 메일 발송 건수 (notified_at 기준).
    // dedupe 차단된 occurrences 누적은 /admin/cron-failures 에서 확인.
    // 24h 신규 발송 3건 이상이면 KPI 카드 tone=warn — 폭주 패턴 조기 감지.
    admin
      .from("cron_failure_log")
      .select("id", { count: "exact", head: true })
      .gte("notified_at", since24hIso),
  ]);

  const aiTotal = (aiUsageRows.data ?? []).reduce(
    (s: number, r: { count: number }) => s + (r.count ?? 0),
    0,
  );

  return {
    newUsers: profilesCount.count ?? 0,
    activeSubs: activeSubsCount.count ?? 0,
    alertsSent: alertsSent.count ?? 0,
    alertsFailed: alertsFailed.count ?? 0,
    alertsSkipped: alertsSkipped.count ?? 0,
    newsCollected: newsCount.count ?? 0,
    programsCollected: (welfareCount.count ?? 0) + (loanCount.count ?? 0),
    aiToday: aiTotal,
    cronAlertsNew: cronAlertsNew.count ?? 0,
  };
}

// 최근 가입 사용자 5건 — auth.users 기준 (가입 즉시 표시, 온보딩 미완 사용자 포함).
// 사고 (2026-04-28): user_profiles 기준이라 가입 후 온보딩 미완 사용자 (untillthen0807)
// 가 카드에 안 보임 → 가입자 추적 누락. auth.users 기준으로 변경 + user_profiles
// region/occupation 은 lookup 으로 표시 (있으면).
async function getRecentSignups(limit = 5) {
  const admin = createAdminClient();
  const [users, profilesResult] = await Promise.all([
    getAuthUsersCached(),
    admin
      .from("user_profiles")
      .select("id, region, occupation"),
  ]);

  const profileMap = new Map(
    (profilesResult.data ?? []).map(
      (p: { id: string; region: string | null; occupation: string | null }) => [p.id, p],
    ),
  );

  // auth.users 를 created_at 내림차순 정렬 후 limit
  const recent = [...users]
    .filter((u) => u.created_at) // null 안전
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, limit);

  return recent.map((u) => {
    const profile = profileMap.get(u.id);
    return {
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at ?? "",
      region: profile?.region ?? null,
      occupation: profile?.occupation ?? null,
    };
  });
}

// "방금 전", "5분 전", "3시간 전" 같은 상대 시각 포맷 — 대시보드 가독성용
function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / (60 * 1000));
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireAdmin();
  const params = await searchParams;
  const error = params.error;

  const [
    stats,
    recentSignups,
    myActions,
    kpi,
    dailySignups,
    dailyRevenue,
    recentPayments,
  ] = await Promise.all([
    get24hStats(),
    getRecentSignups(5),
    getActorActionsPaged(actor.id, { limit: 5, offset: 0 }),
    getSummaryKpi(),
    getDailySignups(30),
    getDailyRevenueEstimated(30),
    getRecentPayments(5),
  ]);

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[980px] mx-auto px-5">
        {/* 헤더 */}
        <div className="mb-8">
          <p className="text-[12px] text-blue-500 font-semibold tracking-[0.2em] mb-3">
            ADMIN · 대시보드
          </p>
          <h1 className="text-[26px] font-extrabold tracking-[-0.6px] text-grey-900 mb-2">
            사이트 한눈에 보기
          </h1>
          <p className="text-[14px] text-grey-700 leading-[1.6]">
            {actor.email ?? "운영자"} 로 로그인됨 · 최근 24시간 기준 지표
          </p>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div
            role="alert"
            className="bg-red/10 border border-red/30 rounded-lg p-3 text-[13px] text-red mb-4"
          >
            {error}
          </div>
        )}

        {/* Phase 6 — 운영 종합 대시보드 CTA */}
        <Link
          href="/admin/health"
          className="block bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-6 hover:bg-blue-100 no-underline transition-colors"
        >
          <p className="text-[12px] text-blue-700 font-semibold mb-1">PHASE 6 NEW</p>
          <h2 className="text-[18px] font-bold text-blue-900 mb-1">
            🩺 운영 health 종합 대시보드 →
          </h2>
          <p className="text-[13px] text-blue-800">
            헬스 신호·30일 추세·임계치 알림·빠른 링크 한 페이지에서.
          </p>
        </Link>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* 누적 KPI 카드 4종 — 비즈 한눈 보기 */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="mb-6">
          <h2 className="text-[16px] font-bold text-grey-900 mb-3 tracking-[-0.3px]">
            관리자 요약
          </h2>
          <p className="text-[13px] text-grey-600 mb-3">
            베타 운영 지표를 한눈에 볼 수 있어요. 환불 대기는 시스템 미구현 (항상 0).
            매출은 활성 구독 × tier 가격 추정 (라이브 결제 활성화 후 실제 결제로 교체 예정).
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <BigKpiCard label="총 사용자" value={`${kpi.totalUsers.toLocaleString()}명`} />
            <BigKpiCard label="활성 구독" value={`${kpi.activeSubscriptions.toLocaleString()}건`} />
            <BigKpiCard label="환불 대기" value={`${kpi.refundPending.toLocaleString()}건`} />
            <BigKpiCard
              label="이번 달 매출 (추정)"
              value={`₩${kpi.monthRevenueEstimated.toLocaleString()}`}
            />
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* 30일 차트 2종 — 매출 추이 + 신규 가입 추이 */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          <div className="bg-white border border-grey-200 rounded-lg p-5">
            <h3 className="text-[15px] font-bold text-grey-900 tracking-[-0.2px]">
              일별 매출 추이 (추정)
            </h3>
            <p className="text-[12px] text-grey-600 mb-3">
              지난 30일 (KST 일자 기준, 신규 구독 시점 매출)
            </p>
            <Sparkline data={dailyRevenue} unit="원" stroke="#10B981" />
          </div>
          <div className="bg-white border border-grey-200 rounded-lg p-5">
            <h3 className="text-[15px] font-bold text-grey-900 tracking-[-0.2px]">
              일별 신규 가입
            </h3>
            <p className="text-[12px] text-grey-600 mb-3">
              지난 30일 (KST 일자 기준, auth.users)
            </p>
            <Sparkline data={dailySignups} unit="명" stroke="#3182F6" />
          </div>
        </section>

        {/* 24h 지표 카드 6종 */}
        <section className="mb-8">
          <h2 className="text-[16px] font-bold text-grey-900 mb-3 tracking-[-0.3px]">
            최근 24시간 운영 지표
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="신규 가입" value={stats.newUsers} suffix="명" />
            <StatCard
              label="활성 구독 (전체)"
              value={stats.activeSubs}
              suffix="명"
              hint="basic·pro (trialing/active/charging/manual_grant)"
            />
            <StatCard
              label="알림 발송 성공"
              value={stats.alertsSent}
              suffix="건"
              hint={
                stats.alertsFailed > 0 || stats.alertsSkipped > 0
                  ? `실패 ${stats.alertsFailed} · 건너뜀 ${stats.alertsSkipped}`
                  : "email + kakao (alert_deliveries status=sent)"
              }
              tone={stats.alertsFailed > 0 ? "warn" : "neutral"}
            />
            <StatCard label="뉴스 수집" value={stats.newsCollected} suffix="건" />
            <StatCard
              label="공고 수집"
              value={stats.programsCollected}
              suffix="건"
              hint="welfare + loan programs"
            />
            <StatCard
              label="AI 상담 (오늘 KST)"
              value={stats.aiToday}
              suffix="회"
              hint="ai_usage_log sum"
            />
            <StatCard
              label="cron 실패 알림"
              value={stats.cronAlertsNew}
              suffix="건"
              hint={
                stats.cronAlertsNew >= 3
                  ? "폭주 의심 — /admin/cron-failures 점검"
                  : "24h 신규 메일 발송 (occurrences 누적은 별도)"
              }
              tone={stats.cronAlertsNew >= 3 ? "warn" : "neutral"}
            />
          </div>
        </section>

        {/* 사용자 조회 */}
        <section className="mb-8">
          <h2 className="text-[16px] font-bold text-grey-900 mb-3 tracking-[-0.3px]">
            사용자 조회
          </h2>
          <form action={searchUser} className="flex gap-2 max-md:flex-col">
            <input
              type="text"
              name="query"
              required
              placeholder="이메일 또는 UUID (예: user@example.com 또는 7e25d1c8-...)"
              className="flex-1 px-4 py-3 border border-grey-200 rounded-lg text-[14px] focus:border-blue-500 focus:outline-none bg-white"
            />
            <button
              type="submit"
              className="px-5 py-3 bg-blue-500 text-white rounded-lg text-[14px] font-bold hover:bg-blue-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              조회
            </button>
          </form>
        </section>

        {/* 빠른 액션 그리드 */}
        <section className="mb-8">
          <h2 className="text-[16px] font-bold text-grey-900 mb-3 tracking-[-0.3px]">
            관리 페이지
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <ActionCard
              href="/admin/health"
              title="🩺 헬스 대시보드"
              desc="DB·cron·환경변수·활성 사용자 한눈에 (매일 첫 페이지)"
            />
            <ActionCard
              href="/admin/insights"
              title="📈 데이터 인사이트"
              desc="cohort funnel + 콘텐츠 TOP + 사용자 분포"
            />
            <ActionCard
              href="/admin/cron-trigger"
              title="⚡ Cron 수동 실행"
              desc="모든 cron 한 페이지 manual trigger (8 일반 + 17 광역)"
            />
            <ActionCard
              href="/api/admin/export-users"
              title="📥 사용자 CSV 다운로드"
              desc="auth.users + user_profiles 통합 CSV (이메일 마스킹)"
            />
            <ActionCard
              href="/admin/alimtalk"
              title="알림톡 운영"
              desc="24h 발송 집계·환경변수·테스트 발송"
            />
            <ActionCard
              href="/admin/news"
              title="정책 뉴스 운영"
              desc="수집 현황·수동 trigger·카테고리별"
            />
            <ActionCard
              href="/admin/blog"
              title="블로그 글 관리"
              desc="제목·도입부·본문·태그·발행 상태 수정"
            />
            <ActionCard
              href="/admin/enrich-detail"
              title="공고 상세 보강"
              desc="bokjiro·youthcenter Detail fetcher 즉시 실행"
            />
            <ActionCard
              href="/admin/targeting"
              title="본문 분석 운영"
              desc="Phase 1.5 income 분석 진행률 + 백필 trigger 안내"
            />
            <ActionCard
              href="/admin/business"
              title="자영업자 wedge"
              desc="business_profiles 입력 현황·필드 채움률·전환율"
            />
            <ActionCard
              href="/admin/cron-failures"
              title="cron 실패 알림"
              desc="24h 신규/누적·prefix 그룹·전체 목록"
            />
            <ActionCard
              href="/admin/my-actions"
              title="내 수행 내역"
              desc="감사 로그 페이지네이션 열람"
            />
            <ActionCard
              href="/"
              title="홈으로"
              desc="사용자 화면으로 이동"
            />
          </div>
        </section>

        {/* 최근 활동 2열 */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {/* 최근 가입자 5건 */}
          <Panel title={`최근 가입자 ${recentSignups.length}명`}>
            {recentSignups.length === 0 ? (
              <p className="text-[13px] text-grey-600 py-2">
                최근 가입자가 없어요.
              </p>
            ) : (
              <ul className="space-y-2">
                {recentSignups.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-3 pb-2 border-b border-grey-100 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-grey-900 truncate">
                        {u.email ?? "(이메일 없음)"}
                      </div>
                      <div className="text-[12px] text-grey-600 leading-[1.5]">
                        {[u.region, u.occupation].filter(Boolean).join(" · ") || "프로필 미작성"}
                        {" · "}
                        {fmtRelative(u.created_at)}
                      </div>
                    </div>
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="text-[12px] font-medium text-blue-500 hover:underline whitespace-nowrap"
                    >
                      상세 →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* 최근 결제 5건 */}
          <Panel title={`최근 결제 ${recentPayments.length}건`}>
            {recentPayments.length === 0 ? (
              <p className="text-[13px] text-grey-600 py-2">
                결제 이력이 아직 없어요.
              </p>
            ) : (
              <ul className="space-y-2">
                {recentPayments.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 pb-2 border-b border-grey-100 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-grey-900 truncate">
                        {p.email ?? "(이메일 없음)"}
                      </div>
                      <div className="text-[12px] text-grey-600 leading-[1.5]">
                        {TIER_NAMES[p.tier as "basic" | "pro"] ?? p.tier}
                        {" · "}
                        ₩{p.amount.toLocaleString()}
                        {" · "}
                        {fmtRelative(p.createdAt)}
                      </div>
                    </div>
                    <Link
                      href={`/admin/users/${p.userId}`}
                      className="text-[12px] font-medium text-blue-500 hover:underline whitespace-nowrap"
                    >
                      상세 →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* 내 최근 관리자 액션 5건 */}
          <Panel title={`내 최근 관리자 액션 ${myActions.records.length}건`}>
            {myActions.records.length === 0 ? (
              <p className="text-[13px] text-grey-600 py-2">
                최근 수행한 관리 작업이 없어요.
              </p>
            ) : (
              <ul className="space-y-2">
                {myActions.records.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 pb-2 border-b border-grey-100 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-grey-900">
                        {ACTION_LABELS[a.action] ?? a.action}
                      </div>
                      <div className="text-[12px] text-grey-600 truncate leading-[1.5]">
                        {a.targetUserId ? (
                          <span className="font-mono">
                            {a.targetUserId.slice(0, 8)}…
                          </span>
                        ) : (
                          <span>—</span>
                        )}
                        {" · "}
                        {fmtRelative(a.createdAt)}
                      </div>
                    </div>
                    {a.targetUserId && (
                      <Link
                        href={`/admin/users/${a.targetUserId}`}
                        className="text-[12px] font-medium text-blue-500 hover:underline whitespace-nowrap"
                      >
                        대상 →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/admin/my-actions"
              className="block text-[13px] font-medium text-blue-500 hover:underline mt-3"
            >
              전체 보기 →
            </Link>
          </Panel>
        </section>

        {/* 권한 안내 */}
        <p className="mt-10 text-[13px] text-grey-600 leading-[1.7]">
          이 페이지는 운영자 전용입니다. 권한은 Vercel 환경변수{" "}
          <code>ADMIN_EMAILS</code> (쉼표 구분 이메일 목록, 대소문자 무시) 로 관리합니다.
          <br />
          어드민 추가 시: Vercel Settings → Environment Variables → ADMIN_EMAILS
          에 이메일 추가 후 재배포.
        </p>
      </div>
    </main>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 작은 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 누적 KPI 카드 — StatCard 보다 큰 숫자 + 라벨 위에 배치 (캡쳐 톤)
function BigKpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-grey-200 bg-white p-5">
      <div className="text-[13px] font-medium text-grey-600 mb-2">{label}</div>
      <div className="text-[28px] font-extrabold text-grey-900 leading-none tracking-[-0.5px]">
        {value}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number;
  suffix?: string;
  hint?: string;
  /** warn: 실패·비정상이 있어 주의 필요 (알림 실패>0 등) */
  tone?: "neutral" | "warn";
}) {
  const border = tone === "warn" ? "border-red/30 bg-red/5" : "border-grey-200 bg-white";
  const hintColor = tone === "warn" ? "text-red font-semibold" : "text-grey-600";
  return (
    <div className={`rounded-lg border p-4 ${border}`}>
      <div className="text-[12px] font-semibold tracking-[0.08em] text-grey-700 uppercase mb-1">
        {label}
      </div>
      <div className="text-[24px] font-extrabold text-grey-900 leading-none">
        {value.toLocaleString()}
        {suffix && <span className="text-[13px] font-semibold text-grey-600 ml-1">{suffix}</span>}
      </div>
      {hint && <div className={`text-[12px] mt-1.5 leading-[1.45] ${hintColor}`}>{hint}</div>}
    </div>
  );
}

function ActionCard({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="bg-white rounded-lg border border-grey-200 p-4 no-underline hover:border-blue-300 hover:shadow-[0_4px_12px_rgba(49,130,246,0.08)] transition-all block"
    >
      <div className="text-[15px] font-bold text-grey-900 mb-1 flex items-center gap-1.5 tracking-[-0.2px]">
        {title}
        <span className="text-blue-500 text-[14px]">→</span>
      </div>
      <div className="text-[13px] text-grey-600 leading-[1.55]">{desc}</div>
    </Link>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-grey-200 rounded-lg p-5">
      <h3 className="text-[15px] font-bold text-grey-900 mb-3 tracking-[-0.2px]">{title}</h3>
      {children}
    </section>
  );
}
