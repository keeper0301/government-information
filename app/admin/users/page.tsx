import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { isAdminUser } from "@/lib/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { formatRegionDisplay } from "@/lib/region-display";
import {
  filterRegisteredUserRows,
  getRegisteredUsersDashboard,
  type RegisteredUserDashboardRow,
} from "@/lib/admin/users-dashboard";

export const metadata: Metadata = {
  title: "가입 사용자 관리 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const DISPLAY_LIMIT = 300;

type PageSearchParams = Promise<{
  q?: string | string[];
  tier?: string | string[];
  profile?: string | string[];
  email?: string | string[];
  alert?: string | string[];
}>;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/users");
  if (!isAdminUser(user.email)) redirect("/");
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function tierLabel(tier: string): string {
  const labels: Record<string, string> = {
    free: "무료",
    basic: "Basic",
    pro: "Pro",
  };
  return labels[tier] ?? tier;
}

function tierTone(tier: string): string {
  if (tier === "pro") return "bg-purple-50 text-purple-700 border-purple-200";
  if (tier === "basic") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-grey-50 text-grey-700 border-grey-200";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  await requireAdmin();
  const params = await searchParams;
  const filters = {
    query: firstParam(params.q).trim(),
    tier: firstParam(params.tier),
    profile: firstParam(params.profile),
    emailConfirmed: firstParam(params.email),
    alert: firstParam(params.alert),
  };

  const dashboard = await getRegisteredUsersDashboard();
  const filteredRows = filterRegisteredUserRows(dashboard.rows, filters);
  const visibleRows = filteredRows.slice(0, DISPLAY_LIMIT);

  return (
    <div className="max-w-[1180px]">
      <AdminPageHeader
        kicker="ADMIN · 사용자"
        title="가입 사용자 관리"
        description="회원가입한 전체 사용자를 검색하고, 온보딩 프로필·이메일 인증·요금제·알림 설정 상태를 한 화면에서 확인합니다. 행의 상세 버튼에서 개별 사용자 관리로 이동합니다."
      />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="전체 가입" value={`${dashboard.stats.totalUsers.toLocaleString()}명`} tone="blue" />
        <MetricCard label="프로필 작성" value={`${dashboard.stats.profiledUsers.toLocaleString()}명`} tone="green" />
        <MetricCard label="30일 내 로그인" value={`${dashboard.stats.activeLast30Days.toLocaleString()}명`} tone="purple" />
        <MetricCard label="유료 사용자" value={`${dashboard.stats.paidUsers.toLocaleString()}명`} tone="amber" />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <BreakdownCard
          title="가입 상태"
          rows={[
            ["이메일 인증", `${dashboard.stats.confirmedEmails.toLocaleString()}명`],
            ["이메일 미인증", `${dashboard.stats.unconfirmedEmails.toLocaleString()}명`],
            ["프로필 미작성", `${dashboard.stats.missingProfileUsers.toLocaleString()}명`],
          ]}
        />
        <BreakdownCard
          title="요금제"
          rows={[
            ["무료", `${dashboard.stats.freeUsers.toLocaleString()}명`],
            ["유료", `${dashboard.stats.paidUsers.toLocaleString()}명`],
            ["활성 알림 보유", `${dashboard.stats.activeAlertUsers.toLocaleString()}명`],
          ]}
        />
        <div className="rounded-2xl border border-grey-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-extrabold text-grey-900">빠른 작업</h2>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/admin/export-users"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 no-underline hover:bg-emerald-100"
            >
              전체 사용자 CSV
            </a>
            <Link
              href="/admin/paid-users"
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 no-underline hover:bg-blue-100"
            >
              유료 사용자 관리
            </Link>
          </div>
        </div>
      </section>

      <form className="mb-5 rounded-2xl border border-grey-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <label className="text-xs font-bold text-grey-600 md:col-span-2">
            검색
            <input
              type="search"
              name="q"
              defaultValue={filters.query}
              placeholder="이메일, UUID, 지역, 직업, 관심사"
              className="mt-1 w-full rounded-lg border border-grey-200 px-3 py-2 text-sm font-normal text-grey-900"
            />
          </label>
          <Select name="tier" label="요금제" value={filters.tier} options={[["", "전체"], ["free", "무료"], ["basic", "Basic"], ["pro", "Pro"], ["paid", "유료 전체"]]} />
          <Select name="profile" label="프로필" value={filters.profile} options={[["", "전체"], ["complete", "작성"], ["missing", "미작성"]]} />
          <Select name="email" label="이메일 인증" value={filters.emailConfirmed} options={[["", "전체"], ["yes", "인증"], ["no", "미인증"]]} />
          <Select name="alert" label="알림" value={filters.alert} options={[["", "전체"], ["active", "활성 알림 있음"], ["none", "활성 알림 없음"]]} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-bold text-white hover:bg-blue-600" type="submit">
            필터 적용
          </button>
          <Link href="/admin/users" className="text-sm font-semibold text-grey-600 underline">
            초기화
          </Link>
          <span className="ml-auto text-xs text-grey-500">
            표시 {visibleRows.length.toLocaleString()}명 / 필터 {filteredRows.length.toLocaleString()}명 / 전체 {dashboard.stats.totalUsers.toLocaleString()}명
          </span>
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-grey-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="bg-grey-50 text-xs font-bold text-grey-600">
              <tr>
                <th className="px-4 py-3">사용자</th>
                <th className="px-4 py-3">가입/로그인</th>
                <th className="px-4 py-3">프로필</th>
                <th className="px-4 py-3">요금제</th>
                <th className="px-4 py-3">알림</th>
                <th className="px-4 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-grey-100">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-grey-500">
                    조건에 맞는 가입 사용자가 없습니다.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => <UserTableRow key={row.userId} row={row} />)
              )}
            </tbody>
          </table>
        </div>
        {filteredRows.length > DISPLAY_LIMIT && (
          <div className="border-t border-grey-100 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
            화면 성능 보호를 위해 상위 {DISPLAY_LIMIT.toLocaleString()}명만 표시합니다. 더 좁은 검색어나 필터를 적용해 주세요.
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: "blue" | "green" | "purple" | "amber" }) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    purple: "border-purple-200 bg-purple-50 text-purple-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="text-xs font-bold opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-[-0.04em]">{value}</p>
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-2xl border border-grey-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-extrabold text-grey-900">{title}</h2>
      <dl className="space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 text-sm">
            <dt className="text-grey-600">{label}</dt>
            <dd className="font-extrabold text-grey-900 tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: Array<[string, string]>;
}) {
  return (
    <label className="text-xs font-bold text-grey-600">
      {label}
      <select
        name={name}
        defaultValue={value}
        className="mt-1 w-full rounded-lg border border-grey-200 px-3 py-2 text-sm font-normal text-grey-900"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function UserTableRow({ row }: { row: RegisteredUserDashboardRow }) {
  return (
    <tr className="align-top hover:bg-grey-50/70">
      <td className="px-4 py-4">
        <div className="font-semibold text-grey-900">{row.email ?? "(이메일 없음)"}</div>
        <div className="mt-1 font-mono text-[11px] text-grey-500">{row.userId}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${row.emailConfirmed ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {row.emailConfirmed ? "이메일 인증" : "이메일 미인증"}
          </span>
          {row.providers.map((provider) => (
            <span key={provider} className="rounded-full bg-grey-100 px-2 py-0.5 text-[11px] font-bold text-grey-700">
              {provider}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-4 text-xs text-grey-700">
        <div>가입: {formatDate(row.authCreatedAt)}</div>
        <div className="mt-1">최근 로그인: {formatDate(row.lastSignInAt)}</div>
      </td>
      <td className="px-4 py-4 text-xs text-grey-700">
        {row.hasProfile ? (
          <>
            <div className="font-semibold text-grey-900">{formatRegionDisplay(row.region) || "지역 미입력"}</div>
            <div className="mt-1">{[row.subDistrict, row.occupation, row.ageGroup].filter(Boolean).join(" · ") || "세부정보 미입력"}</div>
            {row.interests.length > 0 && (
              <div className="mt-1 max-w-[220px] truncate text-grey-500">관심: {row.interests.join(", ")}</div>
            )}
          </>
        ) : (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
            프로필 미작성
          </span>
        )}
      </td>
      <td className="px-4 py-4">
        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${tierTone(row.tier)}`}>
          {tierLabel(row.tier)}
        </span>
        {row.subscriptionStatus && (
          <div className="mt-2 text-xs text-grey-600">상태: {row.subscriptionStatus}</div>
        )}
        {row.currentPeriodEnd && (
          <div className="mt-1 text-xs text-grey-500">다음/만료: {formatDate(row.currentPeriodEnd)}</div>
        )}
      </td>
      <td className="px-4 py-4 text-xs text-grey-700">
        <div className="font-semibold text-grey-900">활성 {row.activeAlertRules.toLocaleString()}개</div>
        <div className="mt-1 text-grey-500">전체 {row.totalAlertRules.toLocaleString()}개</div>
      </td>
      <td className="px-4 py-4 text-right">
        <Link
          href={`/admin/users/${row.userId}`}
          className="inline-flex rounded-lg border border-grey-200 px-3 py-2 text-xs font-bold text-grey-700 no-underline hover:bg-grey-50"
        >
          상세
        </Link>
      </td>
    </tr>
  );
}
