// ============================================================
// RegionMap — 지역별 진행 중 정책 수 시각화 (권역 그룹 카드)
// ============================================================
// 토스 전략: 첫 화면 강력 비주얼 + 호기심 자극.
// 6개 권역 (수도권/강원/충청권/영남권/호남권/제주) 박스 + 박스 안에 시·도
// 카드 배치. 빈 공간 최소화 + 한국인에 익숙한 권역 구분 + 지리 어림 반영.
// 정책 수 많을수록 blue 진한 색 (heatmap). 클릭 시 /welfare?region=시도명.
//
// Layout — 외곽 12-col grid 로 권역 폭 차등 (큰 권역 넓게):
//   Row 1 — 수도권(7) | 강원(5)
//   Row 2 — 충청권(5) | 영남권(7)
//   Row 3 — 호남권(7) | 제주(5)
//   하단 — 전국 대상 (full width)
// 모바일은 1열 stack.
//
// 데이터: welfare_programs 만 region 컬럼 보유. loan_programs 는 X.
// "전국" 대상 정책은 별도 카드 (모든 시·도에 합산하면 시각 의미 약해짐
// — 전국 1,579건이 가장 많아 다른 지역 색이 모두 옅어짐).
// ============================================================

import Link from "next/link";
import { getWelfareRegionCounts } from "@/lib/home-stats";

// 권역 정의 — sidos 순서는 권역 박스 안 grid 좌→우 (지리 어림 반영)
type Region = {
  name: string;
  cols: 1 | 2 | 3;
  sidos: string[];
};

const REGIONS: Region[] = [
  // 수도권: 인천(서) → 서울 → 경기(동)
  { name: "수도권", cols: 3, sidos: ["인천", "서울", "경기"] },
  // 강원: 단일
  { name: "강원", cols: 1, sidos: ["강원"] },
  // 충청권 2x2: 위 [충남(서)·충북(동)], 아래 [세종(서)·대전(동)] — 4방위 어림
  { name: "충청권", cols: 2, sidos: ["충남", "충북", "세종", "대전"] },
  // 영남권 3 cols: 위 [경북·대구·울산], 아래 [경남·부산]
  { name: "영남권", cols: 3, sidos: ["경북", "대구", "울산", "경남", "부산"] },
  // 호남권 1 row: 광주·전북·전남 — 행정 순 (cols=3, 가로 한 줄)
  { name: "호남권", cols: 3, sidos: ["광주", "전북", "전남"] },
  // 제주: 단일
  { name: "제주", cols: 1, sidos: ["제주"] },
];

// Tailwind 동적 className 안전 매핑 (purge 시 누락 방지)
const COLS_CLASS: Record<1 | 2 | 3, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
};

// 모든 시·도 이름 (counts 매핑용)
const SIDO_NAMES = REGIONS.flatMap((r) => r.sidos);

// 정책 수 → 색 강도 (5단계). max 기준 normalize.
// count=0 은 bg-white — 권역 박스 (bg-grey-50) 와 시각 구분.
function intensityClass(count: number, max: number): string {
  if (count === 0) return "bg-white text-grey-500";
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
        {/* 6 권역 박스 — 12-col grid 로 권역별 폭 비율 차등.
            큰 권역(수도권·영남·호남) col-span-7, 작은 권역(강원·충청·제주) col-span-5.
            모바일은 1 col stack. */}
        <div className="grid grid-cols-12 gap-3 max-md:gap-2">
          {/* Row 1 — 수도권 | 강원 */}
          <div className="col-span-7 max-md:col-span-12">
            <RegionGroup region={REGIONS[0]} counts={counts} max={max} />
          </div>
          <div className="col-span-5 max-md:col-span-12">
            <RegionGroup region={REGIONS[1]} counts={counts} max={max} />
          </div>
          {/* Row 2 — 충청권 | 영남권 */}
          <div className="col-span-5 max-md:col-span-12">
            <RegionGroup region={REGIONS[2]} counts={counts} max={max} />
          </div>
          <div className="col-span-7 max-md:col-span-12">
            <RegionGroup region={REGIONS[3]} counts={counts} max={max} />
          </div>
          {/* Row 3 — 호남권 | 제주 */}
          <div className="col-span-7 max-md:col-span-12">
            <RegionGroup region={REGIONS[4]} counts={counts} max={max} />
          </div>
          <div className="col-span-5 max-md:col-span-12">
            <RegionGroup region={REGIONS[5]} counts={counts} max={max} />
          </div>
        </div>

        {/* 전국 대상 — 별도 풀폭 카드 */}
        <Link
          href="/welfare?region=전국"
          title={`전국 대상 — 진행 중 공고 ${nationwide.toLocaleString()}건`}
          className="block mt-3 rounded-2xl bg-grey-50 hover:bg-grey-100 transition-colors py-4 max-md:py-3 px-4 text-center no-underline"
        >
          <div className="text-[11px] font-medium text-grey-600 mb-0.5">전국 대상</div>
          <div className="text-[18px] max-md:text-[16px] font-extrabold tabular-nums text-grey-900">
            {nationwide.toLocaleString()}
            <span className="text-[12px] font-medium text-grey-600 ml-0.5">건</span>
          </div>
        </Link>
      </div>

      <p className="text-[12px] text-grey-500 mt-3">
        ※ 시·군 단위 공고는 광역 시·도에 합산. 색이 진할수록 진행 중 공고가 많은 지역.
      </p>
    </section>
  );
}

// 권역 박스 — 권역명 라벨 + 권역 안 시·도 카드 grid
// h-full 로 같은 row 의 좌·우 박스 높이 맞춤 (CSS Grid 기본 stretch)
function RegionGroup({
  region,
  counts,
  max,
}: {
  region: Region;
  counts: Record<string, number>;
  max: number;
}) {
  return (
    <div className="bg-grey-50 rounded-2xl p-4 max-md:p-3 h-full">
      <div className="text-[11px] font-bold text-grey-500 mb-2 max-md:mb-1.5 px-1 tracking-[-0.01em]">
        {region.name}
      </div>
      <div className={`grid ${COLS_CLASS[region.cols]} gap-2 max-md:gap-1.5`}>
        {region.sidos.map((sido) => (
          <RegionCell
            key={sido}
            name={sido}
            count={counts[sido] ?? 0}
            max={max}
          />
        ))}
      </div>
    </div>
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
