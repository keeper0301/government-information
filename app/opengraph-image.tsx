// ============================================================
// 사이트 루트 기본 OG 이미지 (1200 × 630)
// ============================================================
// Editorial Masthead 브랜드 톤을 OG에 이식. 블로그 글에는
// app/blog/[slug]/opengraph-image.tsx 가 글별 이미지를 생성하므로
// 이 이미지는 루트(/)·정적 페이지들의 기본값.
// ============================================================

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "keepioo · 정책알리미 — 한국의 공공 지원제도를 큐레이션합니다";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(ellipse at 50% 40%, #F5EEDC 0%, #E8DFC6 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          fontFamily: "serif",
          color: "#0E0B08",
          position: "relative",
        }}
      >
        {/* 상단 이중 rule */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          <div style={{ height: 1, background: "#0E0B08" }} />
          <div style={{ height: 3, background: "#0E0B08" }} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 20,
              letterSpacing: 8,
              fontVariant: "small-caps",
              color: "#3D2F22",
              marginTop: 18,
              textTransform: "uppercase",
            }}
          >
            <span>EST · MMXXVI · SEOUL</span>
            <span>NO · Ⅰ</span>
          </div>
        </div>

        {/* 중앙 거대 이탤릭 워드마크 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
          }}
        >
          <div
            style={{
              fontSize: 240,
              fontStyle: "italic",
              fontWeight: 400,
              letterSpacing: -10,
              lineHeight: 1,
              color: "#0E0B08",
            }}
          >
            keepioo
          </div>
          <div
            style={{
              marginTop: 34,
              display: "flex",
              alignItems: "center",
              gap: 18,
              fontSize: 30,
              color: "#0E0B08",
              letterSpacing: 8,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                background: "#8A2A2A",
                transform: "rotate(45deg)",
              }}
            />
            <span>정 책 알 리 미</span>
            <div
              style={{
                width: 10,
                height: 10,
                background: "#8A2A2A",
                transform: "rotate(45deg)",
              }}
            />
          </div>
        </div>

        {/* 하단 이중 rule + 캡션 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          <div style={{ height: 3, background: "#0E0B08" }} />
          <div style={{ height: 1, background: "#0E0B08" }} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 22,
              fontStyle: "italic",
              color: "#3D2F22",
              marginTop: 18,
            }}
          >
            <span>Curating Korea&apos;s public benefits since 2026.</span>
            <span style={{ color: "#8A2A2A", fontSize: 26 }}>♦</span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
