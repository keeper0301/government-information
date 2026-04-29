// ============================================================
// /admin — 운영자 메인 대시보드 (T7 슬림화 후)
// ============================================================
// 사이드바 IA 재설계 (T1~T6) 완료 후 메인은 4 섹션 + 사용자 검색만:
//   1. 헤더 (AdminPageHeader)
//   2. ⚠️ 지금 처리 필요 배너 (alerts.length > 0 일 때만)
//   3. 24h KPI 카드 4개 (가입·구독·자동등록·cron실패)
//   4. 30일 추세 차트 (신규 가입 + 매출 추정)
//   5. 최근 활동 2 col (최근 가입 5건 + 내 작업 5건)
//   6. 사용자 조회 form (#user-search anchor)
//
// 제거된 항목:
//   - ActionCard 그리드 17종 (모두 사이드바로 이전)
//   - 24h KPI 카드 8 → 4 축소 (알림·뉴스·공고·AI 는 사이드바 그룹 페이지에 자체 KPI)
//   - 24h 결제 카드 (Phase 4 카드, 운영점검·컨텐츠 우선순위와 무관)
//   - Phase 6 종합 대시보드 CTA (사이드바 "운영점검·헬스" 가 대체)
//
// 권한:
//   - 비로그인 → /login?next=/admin
//   - 어드민 아니면 → /
//   - layout.tsx 가드 + 본 페이지 가드 (defense in depth)
//   - ADMIN_EMAILS 환경변수에 이메일 포함돼야 함 (lib/admin-auth.ts)
// ============================================================

import { redirect } from "next/navigation";
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
  getDailySignups,
  getDailyRevenueEstimated,
  getAuthUsersCached,
} from "@/lib/admin-stats";
import { Sparkline } from "@/components/admin/sparkline";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { getDashboardAlerts } from "@/lib/admin/dashboard-alerts";

export const metadata: Metadata = {
  title: "어드민 대시보드 | 정책알리미",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// 권한 가드 — layout 가드와 중복이지만 defense in depth.
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

// 사용자 검색 server action — UUID 면 직접 이동, 이메일 이면 listUsers 검색.
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
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 24시간 지표 — 4 KPI (가입·구독·자동등록·cron실패)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 슬림화 결과 4 항목만 fetch. 알림 발송·뉴스·공고·AI 등 다른 KPI 는
// 사이드바 그룹 페이지 (/admin/alimtalk, /admin/insights 등) 에 자체 노출.
async function get24hStats() {
  const admin = createAdminClient();
  const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    profilesCount,
    activeSubsCount,
    cronAlertsNew,
    autoIngested,
  ] = await Promise.all([
    // 신규 가입 — user_profiles 기준 (온보딩 통과 사용자만 카운트).
    admin
      .from("user_profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24hIso),
    // 활성 구독 — basic/pro 중 trialing/active/charging/manual_grant.
    admin
      .from("subscriptions")
      .select("user_id", { count: "exact", head: true })
      .in("tier", ["basic", "pro"])
      .in("status", ["trialing", "active", "charging", "manual_grant"]),
    // cron 실패 알림 — 24h 신규 메일 발송 건수 (notified_at).
    // 3건 이상이면 폭주 의심 → tone=warn.
    admin
      .from("cron_failure_log")
      .select("id", { count: "exact", head: true })
      .gte("notified_at", since24hIso),
    // press-ingest 자동 등록 — 매일 01:30 KST cron 결과.
    admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "auto_press_ingest")
      .gte("created_at", since24hIso),
  ]);

  return {
    newUsers: profilesCount.count ?? 0,
    activeSubs: activeSubsCount.count ?? 0,
    cronAlertsNew: cronAlertsNew.count ?? 0,
    autoIngested: autoIngested.count ?? 0,
  };
}

// 최근 가입 사용자 5건 — auth.users 기준 + user_profiles lookup.
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

  const recent = [...users]
    .filter((u) => u.created_at)
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

// "방금 전", "5분 전" 같은 상대 시각 포맷.
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
    dailySignups,
    dailyRevenue,
    alerts,
  ] = await Promise.all([
    get24hStats(),
    getRecentSignups(5),
    getActorActionsPaged(actor.id, { limit: 5, offset: 0 }),
    getDailySignups(30),
    getDailyRevenueEstimated(30),
    getDashboardAlerts(),
  ]);

  return (
    <div className="max-w-[980px]">
      {/* 1. 헤더 */}
      <AdminPageHeader
        kicker="ADMIN"
        title="대시보드"
        description={`${actor.email ?? "운영자"} 로 로그인됨 · 최근 24시간 운영 지표 + 30일 추세`}
      />

      {/* 에러 메시지 (쿼리 ?error=) */}
      {error && (
        <div
          role="alert"
          className="bg-red/10 border border-red/30 rounded-xl p-3 text-[13px] text-red mb-4"
        >
          {error}
        </div>
      )}

      {/* 2. ⚠️ 지금 처리 필요 — alerts.length > 0 시만 */}
      {alerts.length > 0 && (
        <section className="mb-6">
          <div className="bg-red/10 border border-red/30 rounded-xl p-4">
            <h2 className="text-[14px] font-bold text-grey-900 mb-3 flex items-center gap-2">
              <span aria-hidden>⚠️</span>
              지금 처리 필요
            </h2>
            <div className="flex flex-wrap gap-2">
              {alerts.map((a) => (
                <Link
                  key={a.key}
                  href={a.href}
                  className="inline-flex items-center gap-1.5 bg-white border border-red/30 rounded-full px-3 py-1.5 text-[13px] font-semibold text-grey-900 hover:border-red hover:bg-red/10 no-underline transition-colors"
                >
                  <span>{a.label}</span>
                  <span className="text-red font-extrabold">
                    {a.count.toLocaleString()}
                  </span>
                  <span className="text-grey-700">→</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 3. 24h KPI 카드 4개 */}
      <section className="mb-8">
        <h2 className="text-[15px] font-bold text-grey-900 mb-3 tracking-[-0.02em]">
          최근 24시간
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="신규 가입"
            value={stats.newUsers}
            suffix="명"
            hint="user_profiles 기준 (온보딩 통과)"
          />
          <KpiCard
            label="활성 구독"
            value={stats.activeSubs}
            suffix="명"
            hint="basic·pro 활성 상태"
          />
          <KpiCard
            label="자동 등록"
            value={stats.autoIngested}
            suffix="건"
            hint="press-ingest 매일 01:30 KST"
          />
          <KpiCard
            label="cron 실패 알림"
            value={stats.cronAlertsNew}
            suffix="건"
            hint={
              stats.cronAlertsNew >= 3
                ? "폭주 의심 — 점검 필요"
                : "24h 신규 메일 발송"
            }
            tone={stats.cronAlertsNew >= 3 ? "warn" : "neutral"}
          />
        </div>
      </section>

      {/* 4. 30일 추세 차트 2종 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
        <div className="bg-white border border-grey-200 rounded-xl p-5">
          <h3 className="text-[15px] font-bold text-grey-900 tracking-[-0.02em]">
            일별 신규 가입
          </h3>
          <p className="text-[12px] text-grey-700 mb-3">
            지난 30일 (KST 일자 기준, auth.users)
          </p>
          {/* Sparkline stroke 은 SVG attribute 라 Tailwind 클래스 적용 불가 → hex 유지 */}
          <Sparkline data={dailySignups} unit="명" stroke="#3182F6" />
        </div>
        <div className="bg-white border border-grey-200 rounded-xl p-5">
          <h3 className="text-[15px] font-bold text-grey-900 tracking-[-0.02em]">
            일별 매출 추이 (추정)
          </h3>
          <p className="text-[12px] text-grey-700 mb-3">
            지난 30일 (신규 구독 시점 매출 추정)
          </p>
          {/* Sparkline stroke 은 SVG attribute 라 Tailwind 클래스 적용 불가 → hex 유지 */}
          <Sparkline data={dailyRevenue} unit="원" stroke="#10B981" />
        </div>
      </section>

      {/* 5. 최근 활동 — 가입 5건 + 내 작업 5건 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
        {/* 좌: 최근 가입자 */}
        <Panel title={`최근 가입자 ${recentSignups.length}명`}>
          {recentSignups.length === 0 ? (
            <p className="text-[13px] text-grey-700 py-2">
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
                    <div className="text-[12px] text-grey-700 leading-[1.5]">
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

        {/* 우: 내 최근 관리자 액션 */}
        <Panel title={`내 최근 관리자 액션 ${myActions.records.length}건`}>
          {myActions.records.length === 0 ? (
            <p className="text-[13px] text-grey-700 py-2">
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
                    <div className="text-[12px] text-grey-700 truncate leading-[1.5]">
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

      {/* 6. 사용자 조회 — 사이드바 메뉴 link 대상 (#user-search) */}
      <section id="user-search" className="mb-6 scroll-mt-20">
        <h2 className="text-[15px] font-bold text-grey-900 mb-3 tracking-[-0.02em]">
          사용자 조회
        </h2>
        <p className="text-[13px] text-grey-700 mb-3 leading-[1.6]">
          이메일 또는 UUID 로 사용자 상세 페이지로 즉시 이동합니다.
        </p>
        <form action={searchUser} className="flex gap-2 max-md:flex-col">
          <input
            type="text"
            name="query"
            required
            placeholder="이메일 또는 UUID (예: user@example.com 또는 7e25d1c8-...)"
            className="flex-1 px-4 py-3 border border-grey-200 rounded-xl text-[14px] focus:border-blue-500 focus:outline-none bg-white"
          />
          <button
            type="submit"
            className="px-5 py-3 bg-blue-500 text-white rounded-xl text-[14px] font-bold hover:bg-blue-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            조회
          </button>
        </form>
      </section>

      {/* 권한 안내 */}
      <p className="mt-10 text-[13px] text-grey-700 leading-[1.7]">
        이 페이지는 운영자 전용입니다. 권한은 Vercel 환경변수{" "}
        <code className="bg-grey-100 px-1 py-0.5 rounded text-[12px]">ADMIN_EMAILS</code> 로 관리합니다.
      </p>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 작은 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 24h KPI 카드 — radius 12 (rounded-xl), 토스 톤 색상
function KpiCard({
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
  /** warn: 비정상 신호 (cron 실패 폭주 등) */
  tone?: "neutral" | "warn";
}) {
  const isWarn = tone === "warn";
  const border = isWarn
    ? "border-red/30 bg-red/10"
    : "border-grey-200 bg-white";
  const hintColor = isWarn ? "text-red font-semibold" : "text-grey-700";
  return (
    <div className={`rounded-xl border p-4 ${border}`}>
      <div className="text-[12px] font-semibold tracking-[0.06em] text-grey-700 uppercase mb-1.5">
        {label}
      </div>
      <div className="text-[24px] font-extrabold text-grey-900 leading-none tracking-[-0.02em]">
        {value.toLocaleString()}
        {suffix && (
          <span className="text-[13px] font-semibold text-grey-700 ml-1">
            {suffix}
          </span>
        )}
      </div>
      {hint && (
        <div className={`text-[12px] mt-1.5 leading-[1.45] ${hintColor}`}>
          {hint}
        </div>
      )}
    </div>
  );
}

// 최근 활동 패널 — 가입자·내 액션 공통
function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-grey-200 rounded-xl p-5">
      <h3 className="text-[15px] font-bold text-grey-900 mb-3 tracking-[-0.02em]">
        {title}
      </h3>
      {children}
    </section>
  );
}
