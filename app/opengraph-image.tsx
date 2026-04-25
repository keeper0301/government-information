// ============================================================
// 사이트 루트 기본 OG 이미지 (1200 × 630) — 토스 TDS 풍
// ============================================================
// 흰 배경 + Pretendard 단일 + "keepi[oo]" 워드마크 색 분리 +
// Hero 카피 노출. SNS 공유 (카톡·트위터·페북) 미리보기 카드.
// ============================================================

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "keepioo · 정책알리미 — 숨겨진 정부 혜택, 30초 만에 찾아드릴게요";

// Pretendard 폰트 — 모듈 스코프 캐시로 cold start 이후 디스크 I/O 1회만
let fontDataPromise: Promise<Buffer> | null = null;
function loadFontData(): Promise<Buffer> {
  if (!fontDataPromise) {
    fontDataPromise = readFile(
      join(process.cwd(), "assets/Pretendard-Bold.woff"),
    );
  }
  return fontDataPromise;
}

export default async function OpengraphImage() {
  const fontData = await loadFontData();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#FFFFFF",
          display: "flex",
          flexDirection: "column",
          padding: "88px 96px",
          fontFamily: "Pretendard",
          color: "#191F28",
          position: "relative",
        }}
      >
        {/* 상단: 워드마크 + 부텍스트 한 줄 */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 18,
          }}
        >
          <div
            style={{
              fontSize: 52,
              fontWeight: 800,
              letterSpacing: -2,
              display: "flex",
            }}
          >
            <span style={{ color: "#191F28" }}>keepi</span>
            <span style={{ color: "#3182F6" }}>oo</span>
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#8B95A1",
              letterSpacing: 0.5,
              paddingLeft: 16,
              borderLeft: "2px solid #E5E8EB",
              alignSelf: "center",
            }}
          >
            정책알리미
          </div>
        </div>

        {/* 가운데: 큰 헤드라인 카피 (Hero 와 동일 톤) */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            marginTop: 40,
          }}
        >
          <div
            style={{
              fontSize: 96,
              fontWeight: 800,
              lineHeight: 1.2,
              letterSpacing: -4,
              color: "#191F28",
              wordBreak: "keep-all",
            }}
          >
            숨겨진 정부 혜택,
          </div>
          <div
            style={{
              fontSize: 96,
              fontWeight: 800,
              lineHeight: 1.2,
              letterSpacing: -4,
              color: "#191F28",
              wordBreak: "keep-all",
              marginTop: 8,
            }}
          >
            30초 만에 찾아드릴게요
          </div>
        </div>

        {/* 하단: 데이터 출처 + 도메인 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 24,
            color: "#8B95A1",
            fontWeight: 600,
            paddingTop: 32,
            borderTop: "1px solid #E5E8EB",
          }}
        >
          <span>복지로 · 소상공인24 · 금융위원회 데이터</span>
          <span style={{ color: "#3182F6" }}>keepioo.com</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Pretendard",
          data: fontData,
          style: "normal",
          weight: 700,
        },
      ],
    },
  );
}
