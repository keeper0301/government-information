// ============================================================
// RegionMap — 지역별 진행 중 정책 수 시각화 (실제 한국 SVG 지도)
// ============================================================
// 토스 전략: 첫 화면 강력 비주얼 + 호기심 자극.
// react19-simple-maps + KOSTAT 2018 TopoJSON 으로 진짜 한국 시·도 모양
// 렌더링. 정책 수 많을수록 blue 진한 색 (heatmap). 클릭 시
// /welfare?region=시도명 으로 이동.
//
// 구조: 이 파일은 server component — DB fetch 후 props 로 client wrapper
// (RegionMapSvgWrapper) 에 전달. wrapper 가 dynamic + ssr:false 로 실제
// SVG 컴포넌트 격리 → SSR cold start 영향 최소화.
//
// 2026-04-26 SVG 지도 504 사고 후 재시도. 안전장치 2 중:
// 1. P1 — lib/home-stats.ts / lib/supabase/middleware.ts 에 5초 timeout
// 2. P2 — region-map-svg-wrapper.tsx 에서 dynamic({ ssr:false }) 격리
//
// 데이터: welfare_programs 만 region 컬럼 보유. loan_programs 는 X.
// "전국" 대상 정책은 별도 카드로 표시.
// ============================================================

import Link from "next/link";
import { getWelfareRegionCounts } from "@/lib/home-stats";
import { RegionMapSvgWrapper } from "./region-map-svg-wrapper";

// 17개 시·도 짧은 이름 (TopoJSON 풀네임과 매핑은 region-map-svg.tsx 에서)
const SIDO_NAMES = [
  "서울", "경기", "인천", "강원",
  "충북", "충남", "세종", "대전",
  "전북", "전남", "광주",
  "경북", "경남", "대구", "울산", "부산",
  "제주",
];

export async function RegionMap() {
  // 단일 RPC 호출 (react cache + 5초 timeout 으로 hang 방지).
  const allCounts = await getWelfareRegionCounts();
  const counts: Record<string, number> = {};
  SIDO_NAMES.forEach((name) => {
    counts[name] = allCounts[name] ?? 0;
  });
  const nationwide = allCounts["전국"] ?? 0;

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
        {/* SVG 지도 (client-only, dynamic + ssr:false 로 SSR 부하 격리) */}
        <RegionMapSvgWrapper counts={counts} />

        {/* 전국 대상 — 지도와 별도 풀폭 카드 */}
        <Link
          href="/welfare?region=전국"
          title={`전국 대상 — 진행 중 공고 ${nationwide.toLocaleString()}건`}
          className="block mt-4 rounded-2xl bg-grey-50 hover:bg-grey-100 transition-colors py-4 max-md:py-3 px-4 text-center no-underline"
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
        지도 데이터: KOSTAT 2018 (Apache 2.0).
      </p>
    </section>
  );
}
