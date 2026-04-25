"use client";

// ============================================================
// RegionMapSvg — 실제 한국 SVG 지도 (client component)
// ============================================================
// react19-simple-maps (React 19 호환 fork) + KOSTAT 2018 TopoJSON.
// d3-geo geoMercator projection 으로 한국 위치·축척 맞춤.
// 각 시·도 path 에 헤드맵 색상 + 클릭 → /welfare?region= 이동 + hover 효과.
// 라벨 (시·도명 + 카운트) 은 path 중심점(centroid) 위에 텍스트로.
//
// Fail-loud: TopoJSON 명칭이 NAME_MAP 에 없으면 빨간 경고 색 + console.warn.
// 강원특별자치도(2023)·전북특별자치도(2024) 명칭 갱신 시 즉시 발견 가능.
//
// 2026-04-26 SVG 지도 504 사고 (memory: project_svg_map_504_incident) 후
// 재도입. 이번엔 region-map-svg-wrapper.tsx 의 dynamic + ssr:false 로 격리.
// ============================================================

import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  getGeographyCentroid,
  createCoordinates,
} from "@vnedyalk0v/react19-simple-maps";
import { useRouter } from "next/navigation";

const TOPO_URL = "/topojson/korea-provinces.json";

// TopoJSON 풀네임 → 짧은 이름. KOSTAT 2018 기준 (특별자치도 reform 전 명칭).
const NAME_MAP: Record<string, string> = {
  "서울특별시": "서울",
  "부산광역시": "부산",
  "대구광역시": "대구",
  "인천광역시": "인천",
  "광주광역시": "광주",
  "대전광역시": "대전",
  "울산광역시": "울산",
  "세종특별자치시": "세종",
  "경기도": "경기",
  "강원도": "강원",
  "충청북도": "충북",
  "충청남도": "충남",
  "전라북도": "전북",
  "전라남도": "전남",
  "경상북도": "경북",
  "경상남도": "경남",
  "제주특별자치도": "제주",
};

// 광역시·세종 — path 면적 작아 라벨 폰트 작게.
const SMALL_SIDOS = new Set([
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
]);

// 정책 수 → fill 색 (5단계). 기존 카드 안과 같은 grey/blue 팔레트.
function intensityFill(count: number, max: number): string {
  if (count === 0) return "#f8fafc"; // grey-50
  const ratio = count / max;
  if (ratio >= 0.7) return "#3b82f6"; // blue-500
  if (ratio >= 0.45) return "#60a5fa"; // blue-400
  if (ratio >= 0.25) return "#bfdbfe"; // blue-200
  if (ratio >= 0.1) return "#dbeafe"; // blue-100
  return "#eff6ff"; // blue-50
}

// 라벨 텍스트 색 — fill 진할수록 흰색.
function intensityText(count: number, max: number): string {
  if (count === 0) return "#6b7280"; // grey-500
  const ratio = count / max;
  if (ratio >= 0.45) return "#ffffff";
  return "#1e3a8a"; // blue-900
}

// 라벨 폰트 사이즈 (SVG units). 광역시는 path 작아 폰트 작게.
function labelFontSize(sido: string): { name: number; count: number } {
  if (SMALL_SIDOS.has(sido)) return { name: 11, count: 13 };
  return { name: 14, count: 17 };
}

export function RegionMapSvg({ counts }: { counts: Record<string, number> }) {
  const router = useRouter();
  const max = Math.max(...Object.values(counts), 1);

  return (
    <div className="w-full mx-auto" style={{ maxWidth: 720 }}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          center: createCoordinates(127.7, 35.9),
          scale: 5500,
        }}
        width={800}
        height={760}
        style={{ width: "100%", height: "auto" }}
      >
        <Geographies geography={TOPO_URL}>
          {({ geographies }) => (
            <>
              {/* 1단계: 시·도 path (헤드맵 + 클릭) */}
              {geographies.map((geo) => {
                const fullName = String(geo.properties?.name ?? "");
                const sido = NAME_MAP[fullName];

                if (!sido) {
                  if (process.env.NODE_ENV !== "production") {
                    console.warn(
                      `[RegionMap] Unknown sido name from TopoJSON: "${fullName}". NAME_MAP 에 추가 필요.`,
                    );
                  }
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill="#fee2e2"
                      stroke="#ffffff"
                      strokeWidth={0.8}
                      style={{
                        default: { outline: "none", cursor: "not-allowed" },
                        hover: { outline: "none" },
                        pressed: { outline: "none" },
                      }}
                    >
                      <title>{`${fullName} (지도 매핑 누락)`}</title>
                    </Geography>
                  );
                }

                const count = counts[sido] ?? 0;
                const fill = intensityFill(count, max);

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fill}
                    stroke="#ffffff"
                    strokeWidth={0.8}
                    onClick={() =>
                      router.push(
                        `/welfare?region=${encodeURIComponent(sido)}`,
                      )
                    }
                    style={{
                      default: { outline: "none" },
                      hover: {
                        outline: "none",
                        filter: "brightness(1.08)",
                        cursor: "pointer",
                      },
                      pressed: { outline: "none" },
                    }}
                  >
                    <title>{`${sido} — 진행 중 공고 ${count.toLocaleString()}건`}</title>
                  </Geography>
                );
              })}

              {/* 2단계: 라벨 (centroid 위 시·도명 + 카운트) */}
              {geographies.map((geo) => {
                const fullName = String(geo.properties?.name ?? "");
                const sido = NAME_MAP[fullName];
                if (!sido) return null;

                const count = counts[sido] ?? 0;
                const center = getGeographyCentroid(geo);
                if (!center) return null;

                const textColor = intensityText(count, max);
                const fs = labelFontSize(sido);

                return (
                  <Marker key={`label-${geo.rsmKey}`} coordinates={center}>
                    <text
                      textAnchor="middle"
                      style={{
                        fontFamily: "inherit",
                        fill: textColor,
                        pointerEvents: "none",
                        userSelect: "none",
                      }}
                    >
                      <tspan
                        x="0"
                        dy="-0.2em"
                        style={{ fontSize: `${fs.name}px`, fontWeight: 700 }}
                      >
                        {sido}
                      </tspan>
                      <tspan
                        x="0"
                        dy="1.2em"
                        style={{ fontSize: `${fs.count}px`, fontWeight: 800 }}
                      >
                        {count.toLocaleString()}
                      </tspan>
                    </text>
                  </Marker>
                );
              })}
            </>
          )}
        </Geographies>
      </ComposableMap>
    </div>
  );
}
