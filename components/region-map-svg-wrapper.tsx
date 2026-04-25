"use client";

// ============================================================
// RegionMapSvgWrapper — SVG 지도 client-only 격리 래퍼
// ============================================================
// 이 파일이 따로 있는 이유:
// - Next.js 14+ 부터 server component 안에서 dynamic({ ssr: false }) 직접 사용 X
// - region-map-svg.tsx (실제 SVG, react19-simple-maps + d3-geo 사용) 를
//   server bundle 에 안 들어가게 격리하려고 client wrapper 로 한 번 감쌈
// - ssr:false 로 SSR 단계 SVG 라이브러리 코드 로드 안 함
//   → cold start 시간·번들 크기 영향 최소화
// - 2026-04-26 SVG 지도 504 사고 (memory: project_svg_map_504_incident)
//   재발 방지의 일부. P1 (Supabase RPC timeout) + P2 (이 격리) 두 안전장치.
// ============================================================

import dynamic from "next/dynamic";

const RegionMapSvg = dynamic(
  () =>
    import("./region-map-svg").then((m) => ({ default: m.RegionMapSvg })),
  {
    ssr: false,
    // 로딩 중 회색 박스 — aspectRatio 고정으로 layout shift 방지
    loading: () => (
      <div
        className="w-full mx-auto rounded-2xl bg-grey-50"
        style={{ maxWidth: 720, aspectRatio: "800/760" }}
        aria-label="지도 불러오는 중"
      />
    ),
  },
);

export function RegionMapSvgWrapper({
  counts,
}: {
  counts: Record<string, number>;
}) {
  return <RegionMapSvg counts={counts} />;
}
