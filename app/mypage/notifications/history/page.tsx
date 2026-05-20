import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Pagination } from "@/components/pagination";
import { RecommendationReasonChips } from "@/components/personalization/recommendation-reason-chips";
import {
  NOTIFICATION_HISTORY_PER_PAGE,
  buildDeliveryHref,
  buildNotificationHistoryUrl,
  getDeliveryChannelLabel,
  getDeliveryReasonSignals,
  getDeliveryStatusMeta,
  groupDeliveryPolicyIds,
  normalizeHistorySearchParams,
  periodToStartIso,
  statusToDb,
  type NotificationDelivery,
  type NotificationPolicy,
} from "@/lib/notifications/history-inbox";
import { loadUserProfile } from "@/lib/personalization/load-profile";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "내 정책함 | keepioo",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type WelfarePolicyRow = NotificationPolicy;

type LoanPolicyRow = NotificationPolicy & {
  region_tags?: string[] | null;
};

const POLICY_SELECT =
  "id, title, target, description, eligibility, detailed_content, region, district, sub_district, benefit_tags, apply_end, source, income_target_level, household_target_tags";

const LOAN_POLICY_SELECT =
  "id, title, target, description, eligibility, detailed_content, region, region_tags, district, sub_district, benefit_tags, apply_end, source, income_target_level, household_target_tags";

function toPolicyKey(table: string | null, id: string | null): string {
  return `${table ?? ""}:${id ?? ""}`;
}

function toLoanPolicy(row: LoanPolicyRow): NotificationPolicy {
  return {
    ...row,
    region: row.region ?? row.region_tags?.[0] ?? null,
  };
}

function formatDateTime(value: string | null): string {
  if (!value) return "시간 기록 없음";
  return new Date(value).toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    status?: string;
    period?: string;
    q?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/notifications/history");

  const state = normalizeHistorySearchParams(await searchParams);
  const { page, offset, statusParam, periodParam, q } = state;

  let query = supabase
    .from("alert_deliveries")
    .select("*", { count: "exact" })
    .eq("user_id", user.id);

  const dbStatus = statusToDb(statusParam);
  if (dbStatus) query = query.eq("status", dbStatus);

  const startIso = periodToStartIso(periodParam);
  if (startIso) query = query.gte("created_at", startIso);

  if (q) {
    query = query.ilike("program_title", `%${q}%`);
  }

  const { data: deliveries, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + NOTIFICATION_HISTORY_PER_PAGE - 1);

  const deliveryRows = (deliveries ?? []) as NotificationDelivery[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / NOTIFICATION_HISTORY_PER_PAGE));
  const isFiltered = statusParam !== "all" || periodParam !== "30d" || Boolean(q);
  const isEmpty = deliveryRows.length === 0;

  const profile = await loadUserProfile();
  const policyIds = groupDeliveryPolicyIds(deliveryRows);
  const policiesByKey = new Map<string, NotificationPolicy>();

  if (policyIds.welfareIds.length > 0) {
    const { data } = await supabase
      .from("welfare_programs")
      .select(POLICY_SELECT)
      .in("id", policyIds.welfareIds);

    for (const row of (data ?? []) as WelfarePolicyRow[]) {
      policiesByKey.set(toPolicyKey("welfare_programs", row.id), row);
    }
  }

  if (policyIds.loanIds.length > 0) {
    const { data } = await supabase
      .from("loan_programs")
      .select(LOAN_POLICY_SELECT)
      .in("id", policyIds.loanIds);

    for (const row of (data ?? []) as LoanPolicyRow[]) {
      policiesByKey.set(toPolicyKey("loan_programs", row.id), toLoanPolicy(row));
    }
  }

  function buildUrl(overrides: Record<string, string>) {
    return buildNotificationHistoryUrl(state, overrides);
  }

  const sentCount = deliveryRows.filter((delivery) => delivery.status === "sent").length;
  const failedCount = deliveryRows.filter((delivery) => delivery.status === "failed").length;

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <div className="mb-4">
        <Link href="/mypage/notifications" className="text-sm text-blue-600 underline">
          맞춤 알림 설정
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-grey-950">내 정책함</h1>
        <p className="mt-2 text-sm text-grey-600 leading-6">
          내 조건에 맞아 도착한 정책 알림을 모아 보여줍니다. 각 정책 카드에서 왜 추천됐는지 바로 확인할 수 있습니다.
        </p>
      </header>

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-grey-200 bg-white p-4">
          <div className="text-xs font-semibold text-grey-500">전체</div>
          <div className="mt-1 text-2xl font-bold text-grey-950">{total.toLocaleString()}</div>
          <div className="mt-1 text-xs text-grey-500">
            {totalPages > 1 ? `${page} / ${totalPages} 페이지` : "현재 조건 기준"}
          </div>
        </div>
        <div className="rounded-lg border border-grey-200 bg-white p-4">
          <div className="text-xs font-semibold text-grey-500">현재 목록 도착</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">{sentCount}</div>
          <div className="mt-1 text-xs text-grey-500">이 페이지에 보이는 도착 알림</div>
        </div>
        <div className="rounded-lg border border-grey-200 bg-white p-4">
          <div className="text-xs font-semibold text-grey-500">현재 목록 실패</div>
          <div className="mt-1 text-2xl font-bold text-red-700">{failedCount}</div>
          <div className="mt-1 text-xs text-grey-500">설정 점검이 필요한 알림</div>
        </div>
      </section>

      <form
        method="get"
        action="/mypage/notifications/history"
        className="mb-5 flex flex-wrap items-end gap-3 rounded-lg border border-grey-200 bg-white p-4"
      >
        <label className="text-sm font-medium text-grey-700">
          <span className="mb-1 block">상태</span>
          <select
            name="status"
            defaultValue={statusParam}
            className="rounded-lg border border-grey-200 px-3 py-2 text-sm text-grey-900 outline-none focus:border-blue-500"
          >
            <option value="all">전체</option>
            <option value="sent">도착</option>
            <option value="failed">실패</option>
            <option value="pending">대기</option>
          </select>
        </label>
        <label className="text-sm font-medium text-grey-700">
          <span className="mb-1 block">기간</span>
          <select
            name="period"
            defaultValue={periodParam}
            className="rounded-lg border border-grey-200 px-3 py-2 text-sm text-grey-900 outline-none focus:border-blue-500"
          >
            <option value="7d">최근 7일</option>
            <option value="30d">최근 30일</option>
            <option value="all">전체</option>
          </select>
        </label>
        <label className="min-w-[190px] flex-1 text-sm font-medium text-grey-700">
          <span className="mb-1 block">정책명</span>
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="예: 청년, 월세, 창업"
            maxLength={100}
            className="w-full rounded-lg border border-grey-200 px-3 py-2 text-sm text-grey-900 outline-none focus:border-blue-500"
          />
        </label>
        <button
          type="submit"
          className="min-h-[42px] rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
        >
          적용
        </button>
        {isFiltered && (
          <Link
            href="/mypage/notifications/history"
            className="inline-flex min-h-[42px] items-center rounded-lg border border-grey-200 px-4 text-sm font-semibold text-grey-700 no-underline hover:bg-grey-50"
          >
            초기화
          </Link>
        )}
      </form>

      {isEmpty ? (
        <div className="rounded-lg bg-grey-50 p-8 text-center text-[14px] leading-[1.7] text-grey-700">
          {isFiltered ? (
            <>
              조건에 맞는 정책 알림이 없습니다.
              <br />
              <Link href="/mypage/notifications/history" className="text-blue-600 underline">
                필터를 초기화
              </Link>
              해서 전체 정책함을 확인해 보세요.
            </>
          ) : (
            <>
              아직 도착한 정책 알림이 없습니다.
              <br />
              <Link href="/mypage/notifications" className="text-blue-600 underline">
                맞춤 알림 규칙
              </Link>
              을 설정하면 조건에 맞는 정책을 이곳에 모아둘 수 있습니다.
            </>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {deliveryRows.map((delivery) => {
              const statusMeta = getDeliveryStatusMeta(delivery.status);
              const policy = policiesByKey.get(
                toPolicyKey(delivery.program_table, delivery.program_id),
              );
              const reasonSignals = getDeliveryReasonSignals(
                policy,
                profile?.signals ?? null,
              );
              const deliveredAt = delivery.sent_at ?? delivery.created_at;

              return (
                <Link
                  key={delivery.id}
                  href={buildDeliveryHref(delivery)}
                  className="block rounded-lg border border-grey-200 bg-white p-4 no-underline hover:bg-grey-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-grey-500">
                        {getDeliveryChannelLabel(delivery.channel)} · {formatDateTime(deliveredAt)}
                      </div>
                      <h2 className="mt-1 text-base font-bold leading-6 text-grey-950">
                        {delivery.program_title || policy?.title || "제목 없는 정책"}
                      </h2>
                    </div>
                    <span
                      className={`shrink-0 rounded border px-2 py-0.5 text-[12px] font-bold ${statusMeta.badgeClassName}`}
                    >
                      {statusMeta.label}
                    </span>
                  </div>

                  <div className="mt-3">
                    {reasonSignals.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-grey-500">추천 이유</div>
                        <RecommendationReasonChips signals={reasonSignals} limit={4} />
                      </div>
                    ) : (
                      <p className="text-[13px] leading-5 text-grey-600">
                        정책 상세에서 대상 조건과 신청 정보를 확인해 주세요.
                      </p>
                    )}
                  </div>

                  {delivery.status === "failed" && delivery.error && (
                    <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[12px] leading-5 text-red-700">
                      발송 오류: {delivery.error}
                    </p>
                  )}

                  <div className="mt-3 text-[13px] font-semibold text-blue-700">
                    정책 확인하기
                  </div>
                </Link>
              );
            })}
          </div>

          {totalPages > 1 && (
            <Pagination currentPage={page} totalPages={totalPages} buildUrl={buildUrl} />
          )}
        </>
      )}
    </main>
  );
}
