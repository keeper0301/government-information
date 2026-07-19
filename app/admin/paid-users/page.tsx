import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import {
  activationGapLabel,
  getPaidUsersDashboard,
  interviewSegmentLabel,
  type PaidUserDashboardRow,
} from "@/lib/admin/paid-users-dashboard";
import { TIER_NAMES } from "@/lib/subscription";

export const metadata: Metadata = {
  title: "유료 사용자 관리 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type PageSearchParams = Promise<{
  tier?: string | string[];
  status?: string | string[];
  segment?: string | string[];
  q?: string | string[];
}>;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/paid-users");
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

function formatWon(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    trialing: "체험 중",
    active: "정상 결제",
    charging: "결제 중",
    manual_grant: "수동 부여",
    past_due: "결제 실패",
    cancelled: "해지",
    pending: "카드 등록 전",
    free: "무료",
  };
  return labels[status] ?? status;
}

function statusTone(status: string): string {
  if (status === "active" || status === "trialing" || status === "manual_grant") {
    return "bg-blue-50 text-blue-700 border-blue-200";
  }
  if (status === "past_due" || status === "cancelled") {
    return "bg-red-50 text-red-700 border-red-200";
  }
  if (status === "charging" || status === "pending") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  return "bg-grey-50 text-grey-700 border-grey-200";
}

function matchesFilters(row: PaidUserDashboardRow, filters: {
  tier: string;
  status: string;
  segment: string;
  query: string;
}): boolean {
  if (filters.tier && row.tier !== filters.tier) return false;
  if (filters.status && row.status !== filters.status) return false;
  if (filters.segment && row.interviewSegment !== filters.segment) return false;
  if (!filters.query) return true;

  const haystack = [row.email, row.customerEmail, row.userId, row.cardLabel]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(filters.query.toLowerCase());
}

export default async function AdminPaidUsersPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  await requireAdmin();
  const params = await searchParams;
  const filters = {
    tier: firstParam(params.tier),
    status: firstParam(params.status),
    segment: firstParam(params.segment),
    query: firstParam(params.q).trim(),
  };

  const dashboard = await getPaidUsersDashboard();
  const rows = dashboard.rows.filter((row) => matchesFilters(row, filters));
  const statusOptions = [...new Set(dashboard.rows.map((row) => row.status))].sort();

  return (
    <div className="max-w-[1180px]">
      <AdminPageHeader
        kicker="ADMIN · 고객과 매출"
        title="유료 사용자 관리"
        description="Basic/Pro 구독자, 결제 상태, 활성화 미설정, 인터뷰 후보를 한 화면에서 확인합니다. 상단 KPI는 전체 유료 구독 행 기준이며 아래 필터와 무관하게 계산됩니다."
      />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="활성 유료" value={`${dashboard.stats.activeTotal.toLocaleString()}명`} tone="blue" />
        <MetricCard label="예상 월 반복매출" value={formatWon(dashboard.stats.monthlyRevenueEstimate)} tone="green" />
        <MetricCard label="활성화 미설정" value={`${dashboard.stats.activationGapUsers.toLocaleString()}명`} tone="amber" />
        <MetricCard label="결제 실패/해지" value={`${(dashboard.stats.pastDue + dashboard.stats.cancelled).toLocaleString()}명`} tone="red" />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <BreakdownCard
          title="플랜 구성"
          rows={[
            ["Basic 활성", `${dashboard.stats.activeBasic.toLocaleString()}명`],
            ["Pro 활성", `${dashboard.stats.activePro.toLocaleString()}명`],
            ["체험 중", `${dashboard.stats.trialing.toLocaleString()}명`],
          ]}
        />
        <BreakdownCard
          title="활성화 누락"
          rows={[
            ["사업자 정보 없음", `${dashboard.stats.missingBusinessProfile.toLocaleString()}명`],
            ["Pro 카카오 동의 없음", `${dashboard.stats.missingProKakaoConsent.toLocaleString()}명`],
            ["알림 조건 없음", `${dashboard.stats.missingAlertRules.toLocaleString()}명`],
          ]}
        />
        <BreakdownCard
          title="운영 액션"
          rows={[
            ["인터뷰 후보", `${dashboard.rows.filter((row) => row.interviewSegment !== "basic" && row.interviewSegment !== "pro").length.toLocaleString()}명`],
            ["결제 실패", `${dashboard.stats.pastDue.toLocaleString()}명`],
            ["해지", `${dashboard.stats.cancelled.toLocaleString()}명`],
          ]}
        />
      </section>

      <form className="mb-5 rounded-2xl border border-grey-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <label className="text-xs font-bold text-grey-600 md:col-span-2">
            검색
            <input
              type="search"
              name="q"
              defaultValue={filters.query}
              placeholder="이메일, UUID, 카드 정보"
              className="mt-1 w-full rounded-lg border border-grey-200 px-3 py-2 text-sm font-normal text-grey-900"
            />
          </label>
          <Select name="tier" label="티어" value={filters.tier} options={[["", "전체"], ["basic", "Basic"], ["pro", "Pro"]]} />
          <Select name="status" label="상태" value={filters.status} options={[["", "전체"], ...statusOptions.map((s) => [s, statusLabel(s)] as [string, string])]} />
          <Select
            name="segment"
            label="인터뷰 분류"
            value={filters.segment}
            options={[
              ["", "전체"],
              ["basic", "Basic"],
              ["pro", "Pro"],
              ["activation_gap", "미설정"],
              ["payment_risk", "결제/해지 위험"],
            ]}
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-bold text-white hover:bg-blue-600" type="submit">
            필터 적용
          </button>
          <Link href="/admin/paid-users" className="text-sm font-semibold text-grey-600 underline">
            초기화
          </Link>
          <span className="ml-auto text-xs text-grey-500">
            표시 {rows.length.toLocaleString()}명 / 전체 {dashboard.stats.totalPaidRows.toLocaleString()}명
          </span>
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-grey-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-[1040px] w-full text-left text-sm">
            <thead className="bg-grey-50 text-xs font-bold text-grey-600">
              <tr>
                <th className="px-4 py-3">사용자</th>
                <th className="px-4 py-3">플랜/상태</th>
                <th className="px-4 py-3">결제 주기</th>
                <th className="px-4 py-3">마지막 결제</th>
                <th className="px-4 py-3">활성화</th>
                <th className="px-4 py-3">인터뷰</th>
                <th className="px-4 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-grey-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-grey-500">
                    조건에 맞는 유료 사용자가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => <PaidUserTableRow key={row.userId} row={row} />)
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: "blue" | "green" | "amber" | "red" }) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-red-200 bg-red-50 text-red-700",
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

function PaidUserTableRow({ row }: { row: PaidUserDashboardRow }) {
  return (
    <tr className="align-top hover:bg-grey-50/70">
      <td className="px-4 py-4">
        <div className="font-semibold text-grey-900">{row.email ?? "(이메일 없음)"}</div>
        <div className="mt-1 font-mono text-[11px] text-grey-500">{row.userId}</div>
        <div className="mt-1 text-xs text-grey-500">가입 {formatDate(row.signupAt)}</div>
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-grey-900 px-2.5 py-1 text-xs font-bold text-white">
            {TIER_NAMES[row.tier]}
          </span>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(row.status)}`}>
            {statusLabel(row.status)}
          </span>
        </div>
        {row.cardLabel && <div className="mt-2 text-xs text-grey-600">{row.cardLabel}</div>}
      </td>
      <td className="px-4 py-4 text-xs text-grey-700">
        <div>다음/만료: {formatDate(row.currentPeriodEnd)}</div>
        <div className="mt-1">체험 종료: {formatDate(row.trialEndsAt)}</div>
        {row.cancelledAt && <div className="mt-1 text-red-600">해지: {formatDate(row.cancelledAt)}</div>}
      </td>
      <td className="px-4 py-4 text-xs text-grey-700">
        <div className="font-semibold text-grey-900">{row.lastPaymentStatus ?? "—"}</div>
        <div className="mt-1">{row.lastPaymentAmount == null ? "—" : formatWon(row.lastPaymentAmount)}</div>
        <div className="mt-1">{formatDate(row.lastPaymentAt)}</div>
      </td>
      <td className="px-4 py-4">
        {row.activationGaps.length === 0 ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
            설정 완료
          </span>
        ) : (
          <div className="flex max-w-[190px] flex-wrap gap-1.5">
            {row.activationGaps.map((gap) => (
              <span key={gap} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                {activationGapLabel(gap)}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-4">
        <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700">
          {interviewSegmentLabel(row.interviewSegment)}
        </span>
        <div className="mt-2 text-xs text-grey-500">최근 로그인 {formatDate(row.lastSignInAt)}</div>
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
