import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { getActorActionsPaged } from "@/lib/admin-actions";
import {
  getAuthUsersCached,
  getDailyRevenueEstimated,
  getDailySignups,
} from "@/lib/admin-stats";
import { getDashboardAlerts, type DashboardAlert } from "@/lib/admin/dashboard-alerts";
import { getAdminPersonalizationStatus } from "@/lib/admin/personalization-status";
import { getPolicyInboxStorageStatus } from "@/lib/admin/policy-inbox-storage-status";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { formatRegionDisplay } from "@/lib/region-display";

export const metadata: Metadata = {
  title: "관리자 대시보드 | 정책알리미",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

async function redirectToUserSearchResult(rawQuery: string) {
  const raw = rawQuery.trim();
  if (!raw) return;

  const admin = createAdminClient();
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(raw)) redirect(`/admin/users/${raw}`);

  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error || !data) {
    redirect(`/admin?error=${encodeURIComponent(`조회 실패: ${error?.message ?? "알 수 없음"}`)}`);
  }

  const found = data.users.find((u) => u.email?.toLowerCase() === raw.toLowerCase());
  if (!found) {
    redirect(`/admin?error=${encodeURIComponent(`일치하는 사용자가 없습니다: ${raw}`)}`);
  }
  redirect(`/admin/users/${found.id}`);
}

async function get24hStats() {
  const admin = createAdminClient();
  const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [newUsers, activeSubs, cronFailures, autoIngested] = await Promise.all([
    admin
      .from("user_profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24hIso),
    admin
      .from("subscriptions")
      .select("user_id", { count: "exact", head: true })
      .in("tier", ["basic", "pro"])
      .in("status", ["trialing", "active", "charging", "manual_grant"]),
    admin
      .from("cron_failure_log")
      .select("id", { count: "exact", head: true })
      .gte("last_seen_at", since24hIso),
    admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "press_l2_confirm")
      .gte("created_at", since24hIso),
  ]);

  return {
    newUsers: newUsers.count ?? 0,
    activeSubs: activeSubs.count ?? 0,
    cronFailures: cronFailures.count ?? 0,
    autoIngested: autoIngested.count ?? 0,
  };
}

async function getRecentSignups(limit = 5) {
  const admin = createAdminClient();
  const [users, profilesResult] = await Promise.all([
    getAuthUsersCached(),
    admin.from("user_profiles").select("id, region, occupation"),
  ]);

  const profileMap = new Map(
    (profilesResult.data ?? []).map(
      (p: { id: string; region: string | null; occupation: string | null }) => [p.id, p],
    ),
  );

  return [...users]
    .filter((u) => u.created_at)
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, limit)
    .map((u) => {
      const profile = profileMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        createdAt: u.created_at ?? "",
        region: formatRegionDisplay(profile?.region) ?? null,
        occupation: profile?.occupation ?? null,
      };
    });
}

function formatAdminTimestamp(iso: string): string {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "날짜 없음";

  // Hydration 안정성: "몇 분 전" 같은 Date.now() 기반 상대 시간은 서버 HTML 과
  // 클라이언트 hydration 시점이 어긋나면 텍스트가 달라질 수 있다. 관리자 대시보드의
  // 최근 가입/작업 목록은 절대 시각으로 고정해 첫 HTML 과 RSC payload 를 안정화한다.
  const seoul = new Date(time + 9 * 60 * 60 * 1000);
  const year = seoul.getUTCFullYear();
  const month = String(seoul.getUTCMonth() + 1).padStart(2, "0");
  const day = String(seoul.getUTCDate()).padStart(2, "0");
  const hour = String(seoul.getUTCHours()).padStart(2, "0");
  const minute = String(seoul.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function alertLabel(alert: DashboardAlert): string {
  const labels: Record<DashboardAlert["key"], string> = {
    cron_failure: "cron 실패",
    press_ingest_backlog: "보도자료 후보 적체",
    deletions_overdue: "탈퇴 예약 처리 필요",
    advisor_warn: "Supabase 보안 경고",
    system_error: "알림 시스템 오류",
    dedupe_pending: "중복 정책 검수",
    naver_blog_pending: "네이버 블로그 발행 대기",
  };
  return labels[alert.key] ?? alert.label;
}

function policyStorageLabel(status: string) {
  if (status === "ready") return "정책 저장소 정상";
  if (status === "pending_migration") return "정책 저장소 마이그레이션 필요";
  return "정책 저장소 점검 필요";
}

type FocusItem = {
  href: string;
  icon: string;
  title: string;
  body: string;
  tone: "danger" | "warn" | "good";
  badge: string;
};

function buildFocusItems({
  alerts,
  stats,
  personalization,
  policyStorageStatus,
}: {
  alerts: DashboardAlert[];
  stats: Awaited<ReturnType<typeof get24hStats>>;
  personalization: Awaited<ReturnType<typeof getAdminPersonalizationStatus>>;
  policyStorageStatus: string;
}): FocusItem[] {
  const items: FocusItem[] = [];

  if (alerts.length > 0) {
    items.push({
      href: alerts[0].href,
      icon: "🚨",
      title: "긴급 처리 항목 확인",
      body: `${alertLabel(alerts[0])} 등 ${alerts.length.toLocaleString()}개 항목이 대기 중입니다.`,
      tone: "danger",
      badge: "긴급",
    });
  }

  if (stats.cronFailures > 0) {
    items.push({
      href: "/admin/cron-failures",
      icon: "⚙️",
      title: "cron 실패 재시도",
      body: `최근 24시간 실패 ${stats.cronFailures.toLocaleString()}건을 확인하고 재실행합니다.`,
      tone: "warn",
      badge: "점검",
    });
  }

  if (personalization.failed24h > 0) {
    items.push({
      href: "/admin/alimtalk",
      icon: "📤",
      title: "알림 발송 실패 확인",
      body: `최근 24시간 실패 ${personalization.failed24h.toLocaleString()}건, 실패율 ${personalization.deliveryFailureRate}%입니다.`,
      tone: "warn",
      badge: "발송",
    });
  }

  if (policyStorageStatus !== "ready") {
    items.push({
      href: "/admin/recommendation-trace",
      icon: "🗂️",
      title: "정책 저장소 점검",
      body: "정책함 저장 상태가 정상인지 확인하고 필요한 설정을 보강합니다.",
      tone: "warn",
      badge: "저장소",
    });
  }

  if (items.length === 0) {
    items.push({
      href: "/admin/autonomous",
      icon: "✅",
      title: "운영 상태 정상",
      body: "긴급 알림이 없습니다. 자동화 상태와 다음 개선 과제를 확인하세요.",
      tone: "good",
      badge: "정상",
    });
  }

  items.push({
    href: "/admin/system-ops",
    icon: "🛠️",
    title: "시스템 운영 콘솔",
    body: "실행, 수정, 오류 해결 도구를 한 곳에서 사용합니다.",
    tone: "good",
    badge: "도구",
  });

  return items.slice(0, 4);
}

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; query?: string }>;
}) {
  const actor = await requireAdmin();
  const params = await searchParams;
  if (params.query) await redirectToUserSearchResult(params.query);

  const [
    stats,
    recentSignups,
    myActions,
    dailySignups,
    dailyRevenue,
    alerts,
    personalization,
    policyStorage,
  ] = await Promise.all([
    get24hStats(),
    getRecentSignups(),
    getActorActionsPaged(actor.id, { limit: 5, offset: 0 }),
    getDailySignups(30),
    getDailyRevenueEstimated(30),
    getDashboardAlerts(),
    getAdminPersonalizationStatus(),
    getPolicyInboxStorageStatus(),
  ]);

  const primaryWork = [
    {
      href: "/admin/autonomous",
      icon: "🤖",
      title: "자동화 상태 보기",
      body: "상주 에이전트, 개선 과제, 승인 필요 항목을 한 번에 봅니다.",
    },
    {
      href: "/admin/system-ops",
      icon: "🛠️",
      title: "시스템 실행과 수정",
      body: "cron 재실행, 환경 설정, 오류 점검을 운영 콘솔에서 처리합니다.",
    },
    {
      href: "/admin/press-ingest",
      icon: "📰",
      title: "정책 후보 검수",
      body: "보도자료 기반 후보를 확인하고 등록하거나 제외합니다.",
    },
    {
      href: "/admin/blog",
      icon: "✍️",
      title: "콘텐츠 발행 관리",
      body: "블로그 글, SEO 글, SNS 발행 흐름으로 이동합니다.",
    },
  ];
  const focusItems = buildFocusItems({
    alerts,
    stats,
    personalization,
    policyStorageStatus: policyStorage.status,
  });

  return (
    <div className="max-w-[1120px]">
      <AdminPageHeader
        kicker="ADMIN"
        title="관리자 대시보드"
        description={`${actor.email ?? "관리자"} 계정으로 로그인됨. 오늘 처리할 일, 자동화 상태, 콘텐츠 발행, 고객 알림을 한 화면에서 확인합니다.`}
      />

      {params.error && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
        >
          {params.error}
        </div>
      )}

      <DashboardSection
        number="1"
        title="오늘 할 일"
        description="지금 먼저 누를 작업만 위에 둡니다. 상세 기능은 왼쪽 메뉴나 Ctrl/Cmd+K 검색으로 찾습니다."
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold tracking-[-0.02em] text-grey-900">
                  🎯 지금 먼저 처리
                </h3>
                <p className="mt-1 text-sm text-grey-700">
                  현재 상태 기준으로 우선순위가 높은 작업입니다.
                </p>
              </div>
              <LinkButton href="/admin/system-ops">시스템 콘솔</LinkButton>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {focusItems.map((item) => (
                <FocusCard key={`${item.href}-${item.title}`} item={item} />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-grey-200 bg-grey-50 p-4">
            <div className="mb-3">
              <h3 className="text-base font-extrabold tracking-[-0.02em] text-grey-900">
                자주 쓰는 작업
              </h3>
              <p className="mt-1 text-sm text-grey-700">
                운영자가 반복해서 누르는 대표 경로입니다.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {primaryWork.map((item) => (
                <WorkCard key={item.href} item={item} />
              ))}
            </div>
          </div>
        </div>
      </DashboardSection>

      <DashboardSection
        number="2"
        title="문제"
        description="빨간 알림, 발송 실패, 저장소 이상처럼 바로 확인할 위험 신호를 모았습니다."
      >
        {alerts.length > 0 ? (
          <section className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-extrabold text-red-800">🚨 지금 처리 필요</h3>
              <span className="text-xs font-bold text-red-700">{alerts.length}개 항목</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {alerts.map((alert) => (
                <Link
                  key={alert.key}
                  href={alert.href}
                  className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-3 py-1.5 text-sm font-bold text-grey-900 no-underline hover:border-red-300"
                >
                  <span>{alertLabel(alert)}</span>
                  <span className="text-red-700">{alert.count.toLocaleString()}건</span>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
            ✅ 현재 대시보드 긴급 알림은 없습니다.
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <Panel title="🤖 자동화 준비도">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MiniMetric
                label="추천 준비"
                value={personalization.profileReady}
                suffix="명"
                hint={`전체 ${personalization.profileTotal.toLocaleString()}명 중 ${personalization.profileReadyPercent}%`}
              />
              <MiniMetric
                label="활성 알림 규칙"
                value={personalization.activeRules}
                suffix="개"
                hint={`자동 규칙 ${personalization.autoRules.toLocaleString()}개`}
              />
              <MiniMetric
                label="24h 발송 성공"
                value={personalization.sent24h}
                suffix="건"
                hint={`시도 ${personalization.deliveries24h.toLocaleString()}건`}
              />
              <MiniMetric
                label="24h 발송 실패"
                value={personalization.failed24h}
                suffix="건"
                hint={`실패율 ${personalization.deliveryFailureRate}%`}
                tone={personalization.failed24h > 0 ? "warn" : "neutral"}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <LinkButton href="/admin/recommendation-trace">추천 진단</LinkButton>
              <LinkButton href="/admin/alimtalk">알림톡 운영</LinkButton>
              <LinkButton href="/admin/alert-simulator">발송 시뮬레이션</LinkButton>
            </div>
          </Panel>

          <Panel title="🗂️ 정책 저장소">
            <div className="text-sm font-bold text-grey-900">
              {policyStorageLabel(policyStorage.status)}
            </div>
            <p className="mt-1 text-sm leading-[1.6] text-grey-700">{policyStorage.hint}</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <MiniMetric label="전체" value={policyStorage.count} suffix="건" />
              <MiniMetric label="읽음" value={policyStorage.readCount} suffix="건" />
              <MiniMetric label="저장" value={policyStorage.savedCount} suffix="건" />
            </div>
          </Panel>
        </div>
      </DashboardSection>

      <DashboardSection
        number="3"
        title="지표"
        description="서비스가 잘 굴러가는지 보는 숫자와 최근 활동입니다."
      >
        <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="신규 가입" value={stats.newUsers} suffix="명" hint="최근 24시간" />
          <KpiCard label="활성 구독" value={stats.activeSubs} suffix="명" hint="basic/pro 활성" />
          <KpiCard label="자동 등록" value={stats.autoIngested} suffix="건" hint="정책 후보 승인" />
          <KpiCard
            label="cron 실패"
            value={stats.cronFailures}
            suffix="건"
            hint={stats.cronFailures > 0 ? "확인 필요" : "최근 24시간 정상"}
            tone={stats.cronFailures > 0 ? "warn" : "neutral"}
          />
        </section>

        <section className="mb-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <Panel title="📈 30일 가입 추세">
            <TrendSummary data={dailySignups} unit="명" />
          </Panel>
          <Panel title="💰 30일 매출 추정">
            <TrendSummary data={dailyRevenue} unit="원" />
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Panel title={`👥 최근 가입자 ${recentSignups.length}명`}>
            {recentSignups.length === 0 ? (
              <EmptyText>최근 가입자가 없습니다.</EmptyText>
            ) : (
              <ul className="space-y-3">
                {recentSignups.map((user) => (
                  <li
                    key={user.id}
                    className="flex items-center justify-between gap-3 border-b border-grey-100 pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-grey-900">
                        {user.email ?? "이메일 없음"}
                      </div>
                      <div className="mt-0.5 text-xs text-grey-600">
                        {[user.region, user.occupation].filter(Boolean).join(" / ") ||
                          "프로필 미작성"}
                        {" / "}
                        {formatAdminTimestamp(user.createdAt)}
                      </div>
                    </div>
                    <LinkButton href={`/admin/users/${user.id}`}>상세</LinkButton>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`📋 내 최근 작업 ${myActions.records.length}건`}>
            {myActions.records.length === 0 ? (
              <EmptyText>최근 실행한 관리자 작업이 없습니다.</EmptyText>
            ) : (
              <ul className="space-y-3">
                {myActions.records.map((action) => (
                  <li
                    key={action.id}
                    className="flex items-center justify-between gap-3 border-b border-grey-100 pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-grey-900">
                        {action.action}
                      </div>
                      <div className="mt-0.5 text-xs text-grey-600">
                        {formatAdminTimestamp(action.createdAt)}
                        {action.targetUserId ? ` / ${action.targetUserId.slice(0, 8)}` : ""}
                      </div>
                    </div>
                    {action.targetUserId && (
                      <LinkButton href={`/admin/users/${action.targetUserId}`}>대상</LinkButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3">
              <LinkButton href="/admin/my-actions">전체 로그</LinkButton>
            </div>
          </Panel>
        </section>
      </DashboardSection>

      <section id="user-search" className="scroll-mt-20">
        <Panel title="👤 사용자 조회">
          <p className="mb-3 text-sm leading-[1.6] text-grey-700">
            이메일 또는 UUID를 입력하면 사용자 상세 페이지로 바로 이동합니다.
          </p>
          <form action="/admin" method="get" className="flex gap-2 max-md:flex-col">
            <input
              type="text"
              name="query"
              required
              placeholder="user@example.com 또는 UUID"
              className="flex-1 rounded-lg border border-grey-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-blue-500 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-600"
            >
              조회
            </button>
          </form>
        </Panel>
      </section>
    </div>
  );
}

type WorkItem = {
  href: string;
  icon: string;
  title: string;
  body: string;
};

function DashboardSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 rounded-2xl border border-grey-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-sm font-black text-white">
            {number}
          </div>
          <h2 className="text-xl font-extrabold tracking-[-0.03em] text-grey-950">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-[1.6] text-grey-600">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function FocusCard({ item }: { item: FocusItem }) {
  return (
    <Link
      href={item.href}
      className={`rounded-lg border bg-white p-4 no-underline transition-colors hover:border-blue-400 ${
        item.tone === "danger"
          ? "border-red-200"
          : item.tone === "warn"
            ? "border-amber-200"
            : "border-grey-200"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-2xl" aria-hidden>
          {item.icon}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
            item.tone === "danger"
              ? "bg-red-50 text-red-700"
              : item.tone === "warn"
                ? "bg-amber-50 text-amber-700"
                : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {item.badge}
        </span>
      </div>
      <div className="text-sm font-extrabold text-grey-900">{item.title}</div>
      <div className="mt-1 text-xs leading-[1.5] text-grey-700">{item.body}</div>
    </Link>
  );
}

function WorkCard({ item }: { item: WorkItem }) {
  return (
    <Link
      href={item.href}
      className="rounded-lg border border-grey-200 bg-white p-4 no-underline transition-colors hover:border-blue-300 hover:bg-blue-50"
    >
      <div className="mb-2 text-2xl" aria-hidden>
        {item.icon}
      </div>
      <div className="text-sm font-extrabold text-grey-900">{item.title}</div>
      <div className="mt-1 text-xs leading-[1.5] text-grey-700">{item.body}</div>
    </Link>
  );
}

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
  tone?: "neutral" | "warn";
}) {
  const isWarn = tone === "warn";
  return (
    <div
      className={`rounded-xl border p-4 ${
        isWarn ? "border-amber-200 bg-amber-50" : "border-grey-200 bg-white"
      }`}
    >
      <div className="mb-1.5 text-xs font-bold text-grey-600">{label}</div>
      <div className="text-2xl font-extrabold tracking-[-0.02em] text-grey-900">
        {value.toLocaleString()}
        {suffix && <span className="ml-1 text-sm font-bold text-grey-600">{suffix}</span>}
      </div>
      {hint && (
        <div className={`mt-1 text-xs ${isWarn ? "text-amber-700" : "text-grey-600"}`}>
          {hint}
        </div>
      )}
    </div>
  );
}

function MiniMetric({
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
  tone?: "neutral" | "warn";
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === "warn" ? "border-amber-200 bg-amber-50" : "border-grey-200 bg-grey-50"
      }`}
    >
      <div className="text-xs font-bold text-grey-600">{label}</div>
      <div className="mt-1 text-lg font-extrabold text-grey-900">
        {value.toLocaleString()}
        {suffix && <span className="ml-1 text-xs font-bold text-grey-600">{suffix}</span>}
      </div>
      {hint && <div className="mt-1 text-xs leading-[1.4] text-grey-600">{hint}</div>}
    </div>
  );
}

function TrendSummary({
  data,
  unit,
}: {
  data: Array<{ date: string; value: number }>;
  unit: "명" | "원";
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const latest = data.at(-1)?.value ?? 0;
  const peak = data.reduce((max, item) => Math.max(max, item.value), 0);

  return (
    <div className="grid grid-cols-3 gap-3">
      <MiniMetric label="합계" value={total} suffix={unit} />
      <MiniMetric label="최근" value={latest} suffix={unit} />
      <MiniMetric label="최고" value={peak} suffix={unit} />
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-grey-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-extrabold tracking-[-0.02em] text-grey-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

function LinkButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-md border border-grey-200 bg-white px-2.5 py-1.5 text-xs font-bold text-grey-800 no-underline hover:border-blue-300 hover:text-blue-600"
    >
      {children}
    </Link>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-grey-600">{children}</p>;
}
