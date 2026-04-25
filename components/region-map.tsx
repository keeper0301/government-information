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
import { createClient } from "@/lib/supabase/server";

// 5×4 grid — 한국 시·도 지리 어림 위치 (위→남, 좌→우).
// null = 빈 칸. 16개 시·도 + 제주 1 = 17.
const GRID: (string | null)[] = [
  null,    "서울", "강원", null,    null,
  "인천", "경기", "충북", "경북", null,
  "충남", "대전", "세종", "대구", "울산",
  "광주", "전북", "전남", "경남", "부산",
];

// PostgREST ilike prefix 매칭용 별칭 (DB 의 region 풀네임 → grid 표시명)
const SIDO_PATTERNS: Record<string, string[]> = {
  서울: ["서울"],
  경기: ["경기"],
  인천: ["인천"],
  강원: ["강원"],
  충북: ["충청북", "충북"],
  충남: ["충청남", "충남"],
  세종: ["세종"],
  대전: ["대전"],
  전북: ["전북", "전라북"],
  전남: ["전라남", "전남"],
  광주: ["광주"],
  경북: ["경상북", "경북"],
  경남: ["경상남", "경남"],
  대구: ["대구"],
  울산: ["울산"],
  부산: ["부산"],
  제주: ["제주"],
};

// 정책 수 → 색 강도 (5단계). max 기준 normalize.
function intensityClass(count: number, max: number): string {
  if (count === 0) return "bg-grey-50 text-grey-400";
  const ratio = count / max;
  if (ratio >= 0.7) return "bg-blue-500 text-white";
  if (ratio >= 0.45) return "bg-blue-400 text-white";
  if (ratio >= 0.25) return "bg-blue-200 text-blue-900";
  if (ratio >= 0.1) return "bg-blue-100 text-blue-800";
  return "bg-blue-50 text-blue-700";
}

export async function RegionMap() {
  const supabase = await createClient();

  // 16개 시·도 + 제주 + 전국 = 18 query 병렬. count 만 head:true.
  const sidoNames = Object.keys(SIDO_PATTERNS); // 17개
  const sidoQueries = sidoNames.map((name) => {
    const patterns = SIDO_PATTERNS[name];
    // 첫 prefix 만 사용 — 정규화된 풀네임이라 한 번이면 충분 (성남시 등 시·군까지 포함)
    return supabase
      .from("welfare_programs")
      .select("*", { count: "exact", head: true })
      .ilike("region", `${patterns[0]}%`);
  });
  const nationwideQuery = supabase
    .from("welfare_programs")
    .select("*", { count: "exact", head: true })
    .eq("region", "전국");

  const [nationwideResult, ...sidoResults] = await Promise.all([
    nationwideQuery,
    ...sidoQueries,
  ]);

  const counts: Record<string, number> = {};
  sidoNames.forEach((name, i) => {
    counts[name] = sidoResults[i].count ?? 0;
  });
  const nationwide = nationwideResult.count ?? 0;
  const max = Math.max(...Object.values(counts), 1);

  return (
    <section className="max-w-content mx-auto px-10 max-md:px-6 py-16 max-md:py-10">
      <div className="flex items-baseline justify-between mb-6 max-md:flex-col max-md:items-start max-md:gap-2">
        <h2 className="text-[26px] font-bold tracking-[-0.8px] text-grey-900">
          지역별 진행 중 지원 공고
        </h2>
        <Link
          href="/welfare"
          className="text-sm font-medium text-grey-600 no-underline hover:text-blue-500 transition-colors"
        >
          복지 전체 보기
        </Link>
      </div>

      <div className="bg-white rounded-3xl shadow-md ring-1 ring-grey-100 p-6 max-md:p-4">
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
          <Link
            href="/welfare?region=전국"
            className="block rounded-xl bg-grey-50 hover:bg-grey-100 transition-colors py-4 max-md:py-3 px-4 text-center no-underline group"
          >
            <div className="text-[11px] font-medium text-grey-600 mb-0.5">전국 대상</div>
            <div className="text-[18px] max-md:text-[16px] font-extrabold tabular-nums text-grey-900">
              {nationwide.toLocaleString()}
              <span className="text-[12px] font-medium text-grey-600 ml-0.5">건</span>
            </div>
          </Link>
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
    <Link
      href={`/welfare?region=${encodeURIComponent(name)}`}
      title={`${name} — 진행 중 공고 ${count.toLocaleString()}건`}
      className={`block rounded-xl px-2 py-3 max-md:px-1 max-md:py-2 text-center no-underline transition-all hover:scale-[1.04] hover:shadow-md ${cls}`}
    >
      <div className="text-[12px] max-md:text-[10px] font-bold tracking-[-0.01em] mb-0.5">
        {name}
      </div>
      <div className="text-[14px] max-md:text-[12px] font-extrabold tabular-nums">
        {count.toLocaleString()}
      </div>
    </Link>
  );
}
