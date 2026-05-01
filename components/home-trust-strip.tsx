import { getDataFreshness } from "@/lib/data-freshness";
import { getProgramCounts, type ProgramCounts } from "@/lib/home-stats";

const EMPTY_COUNTS: ProgramCounts = {
  news_total: 0,
  welfare_total: 0,
  loan_total: 0,
  today_new_welfare: 0,
  today_new_loan: 0,
  week_new_welfare: 0,
  week_new_loan: 0,
};

export function buildFreshnessLabel(minutesAgo: number | null): string {
  if (minutesAgo === null) return "수집 상태 확인 중";
  if (minutesAgo < 60) return `${minutesAgo}분 전 업데이트`;
  const hours = Math.floor(minutesAgo / 60);
  return `${hours}시간 전 업데이트`;
}

export function buildTrustStripData(
  countsResult: PromiseSettledResult<ProgramCounts>,
  freshnessResult: PromiseSettledResult<{ minutes_ago: number | null }>,
) {
  const counts =
    countsResult.status === "fulfilled" ? countsResult.value : EMPTY_COUNTS;
  const minutesAgo =
    freshnessResult.status === "fulfilled"
      ? freshnessResult.value.minutes_ago
      : null;

  return {
    todayNew: counts.today_new_welfare + counts.today_new_loan,
    weekNew: counts.week_new_welfare + counts.week_new_loan,
    freshnessLabel: buildFreshnessLabel(minutesAgo),
  };
}

export async function HomeTrustStrip() {
  const [countsResult, freshnessResult] = await Promise.allSettled([
    getProgramCounts(),
    getDataFreshness(),
  ]);
  const { todayNew, weekNew, freshnessLabel } = buildTrustStripData(
    countsResult,
    freshnessResult,
  );

  return (
    <section className="max-w-content mx-auto px-10 py-10 max-md:px-6">
      <div className="grid gap-4 rounded-2xl border border-grey-200 bg-white p-5 shadow-sm md:grid-cols-[1fr_1fr_1.2fr] md:p-6">
        <TrustMetric label="오늘 신규 정책" value={`${todayNew.toLocaleString()}건`} />
        <TrustMetric label="이번 주 신규 정책" value={`${weekNew.toLocaleString()}건`} />
        <div>
          <div className="text-[13px] font-semibold text-grey-500">
            데이터 신뢰 흐름
          </div>
          <div className="mt-1 text-[15px] font-bold text-grey-900">
            수집 → 조건 필터링 → 알림 발송
          </div>
          <div className="mt-1 text-[13px] text-grey-600">
            {freshnessLabel}
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[13px] font-semibold text-grey-500">{label}</div>
      <div className="mt-1 text-[24px] font-extrabold tracking-[-0.6px] text-blue-500">
        {value}
      </div>
    </div>
  );
}
