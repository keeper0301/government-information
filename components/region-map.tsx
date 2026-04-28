// ============================================================
// RegionMap — 지역별 진행 중 정책 수 시각화 (한국 지도 풍 grid)
// ============================================================
// 토스 전략: 첫 화면 강력 비주얼 + 호기심 자극.
// 5x4 grid 로 16개 시·도 지리 어림 배치 + 제주 별도. 정책 수 많을수록
// blue 진한 색 (heatmap). 클릭 시 /welfare?region=시도명 으로 이동해
// 해당 지역 정책 필터링.
//
// 데이터: welfare_programs 만 region 컬럼 보유. loan_programs 는 X.
// "전국" 대상 정책은 별도 카드로 표시 (모든 시·도에 합산하면 시각 의미
// 약해짐 — 전국 1,579건이 가장 많아 다른 지역 색이 모두 옅어짐).
// ============================================================

import Link from "next/link";
import { getWelfareRegionCounts } from "@/lib/home-stats";
import { TrackedLink } from "./tracked-link";
import { EVENTS } from "@/lib/analytics";

// 5×4 grid — 한국 시·도 지리 어림 위치 (위→남, 좌→우).
// null = 빈 칸. 16개 시·도 + 제주 1 = 17.
const GRID: (string | null)[] = [
  null,    "서울", "강원", null,    null,
  "인천", "경기", "충북", "경북", null,
  "충남", "대전", "세종", "대구", "울산",
  "광주", "전북", "전남", "경남", "부산",
];

const SIDO_NAMES = [
  "서울", "경기", "인천", "강원",
  "충북", "충남", "세종", "대전",
  "전북", "전남", "광주",
  "경북", "경남", "대구", "울산", "부산",
  "제주",
];

// 정책 수 → 색 강도 (5단계). max 기준 normalize.
function intensityClass(count: number, max: number): string {
  // count=0 셀은 시각적으로 흐릿하게 — bg-grey-50 만으로도 충분히 비활성 인상.
  // 텍스트는 grey-500 (대비 5.2:1, WCAG AA 통과). grey-400(2.5:1) 은 본문 미달.
  if (count === 0) return "bg-grey-50 text-grey-500";
  const ratio = count / max;
  if (ratio >= 0.7) return "bg-blue-500 text-white";
  if (ratio >= 0.45) return "bg-blue-400 text-white";
  if (ratio >= 0.25) return "bg-blue-200 text-blue-900";
  if (ratio >= 0.1) return "bg-blue-100 text-blue-800";
  return "bg-blue-50 text-blue-700";
}

export async function RegionMap() {
  // 단일 RPC 호출 (이전엔 18 queries 병렬 → 1 query). react cache 로
  // 같은 요청 안 다른 호출자와 결과 공유.
  const allCounts = await getWelfareRegionCounts();
  const counts: Record<string, number> = {};
  SIDO_NAMES.forEach((name) => {
    counts[name] = allCounts[name] ?? 0;
  });
  const nationwide = allCounts["전국"] ?? 0;
  const max = Math.max(...Object.values(counts), 1);

  return (
    <section className="max-w-content mx-auto px-10 max-md:px-6 py-16 max-md:py-10">
      <div className="flex items-baseline justify-between mb-6 max-md:flex-col max-md:items-start max-md:gap-2">
        <h2 className="text-[26px] font-bold tracking-[-0.8px] text-grey-900">
          지역별 진행 중 지원 공고
        </h2>
        <Link
          href="/welfare"
          className="text-sm font-medium text-grey-600 no-underline hover:text-blue-500 transition-colors max-md:inline-flex max-md:items-center max-md:min-h-[44px] max-md:px-2 max-md:-mx-2"
        >
          복지 전체 보기
        </Link>
      </div>

      <div className="bg-white rounded-3xl shadow-sm p-6 max-md:p-4">
        {/* 5×4 grid — 지리 어림. 모바일도 5 col 유지하되 padding·텍스트 더 작게 */}
        <div className="grid grid-cols-5 gap-2 max-md:gap-1">
          {GRID.map((sido, i) =>
            sido === null ? (
              <div key={`empty-${i}`} aria-hidden="true" />
            ) : (
              <RegionCell key={sido} name={sido} count={counts[sido] ?? 0} max={max} />
            ),
          )}
        </div>

        {/* 제주 + 전국 별도 카드 (그리드 아래) */}
        <div className="grid grid-cols-2 gap-3 mt-3 max-md:gap-2">
          <RegionCell name="제주" count={counts["제주"] ?? 0} max={max} />
          <TrackedLink
            href="/welfare?region=전국"
            event={EVENTS.HOME_REGION_CARD_CLICKED}
            params={{ region: "전국" }}
            className="block rounded-xl bg-grey-50 hover:bg-grey-100 transition-colors py-4 max-md:py-3 px-4 text-center no-underline group"
          >
            <div className="text-[11px] font-medium text-grey-600 mb-0.5">전국 대상</div>
            <div className="text-[18px] max-md:text-[16px] font-extrabold tabular-nums text-grey-900">
              {nationwide.toLocaleString()}
              <span className="text-[12px] font-medium text-grey-600 ml-0.5">건</span>
            </div>
          </TrackedLink>
        </div>
      </div>

      <p className="text-[12px] text-grey-500 mt-3">
        ※ 시·군 단위 공고는 광역 시·도에 합산. 색이 진할수록 진행 중 공고가 많은 지역.
      </p>
    </section>
  );
}

// 단일 시·도 박스 — 색 강도 + 지역명 + 카운트 + click 링크
// 모바일: 좁은 width 대비 padding·텍스트 한 단계 작게 + 텍스트 ellipsis 방어
function RegionCell({
  name,
  count,
  max,
}: {
  name: string;
  count: number;
  max: number;
}) {
  const cls = intensityClass(count, max);
  return (
    <TrackedLink
      href={`/welfare?region=${encodeURIComponent(name)}`}
      event={EVENTS.HOME_REGION_CARD_CLICKED}
      params={{ region: name }}
      title={`${name} — 진행 중 공고 ${count.toLocaleString()}건`}
      className={`block rounded-xl px-2 py-3 max-md:px-1 max-md:py-2 text-center no-underline transition-all hover:scale-[1.04] hover:shadow-md ${cls}`}
    >
      <div className="text-[12px] max-md:text-[10px] font-bold tracking-[-0.01em] mb-0.5">
        {name}
      </div>
      <div className="text-[14px] max-md:text-[12px] font-extrabold tabular-nums">
        {count.toLocaleString()}
      </div>
    </TrackedLink>
  );
}
