// ============================================================
// /api/og-logo — Schema.org publisher.logo 용 정사각형 PNG
// ============================================================
// 2026-05-11 AdSense follow-up. 기존 publisher.logo.url 이 /logo.svg
// (560×140 직사각형) 라 일부 Google SERP/AdSense 검수 봇이 SVG 무시.
// 600×600 정사각형 PNG 가 가장 안전 (Google Article rich result 권장).
//
// 동적 endpoint 라 의존성 추가 0 (next/og 는 next 패키지 내장).
// Cache-Control 1년 immutable — 로고 디자인 안 바뀌면 첫 요청 후 CDN edge cache.
// ============================================================

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

// Pretendard 폰트 — 모듈 캐시 (cold start 후 1회 로드, instagram-card 와 동일 패턴)
let fontDataPromise: Promise<Buffer> | null = null;
function loadFontData(): Promise<Buffer> {
  if (!fontDataPromise) {
    fontDataPromise = readFile(
      join(process.cwd(), "assets/Pretendard-Bold.woff"),
    );
  }
  return fontDataPromise;
}

export async function GET() {
  const fontData = await loadFontData();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#FFFFFF",
          fontFamily: "Pretendard",
        }}
      >
        {/* 워드마크: keepi (grey-900) + oo (toss blue) — logo.svg 와 동일 배색 */}
        <div
          style={{
            display: "flex",
            fontSize: 180,
            fontWeight: 800,
            letterSpacing: "-8px",
            lineHeight: 1,
          }}
        >
          <span style={{ color: "#191F28" }}>keepi</span>
          <span style={{ color: "#3182F6" }}>oo</span>
        </div>

        {/* 한국어 부텍스트 (logo.svg 의 "정책알리미") */}
        <div
          style={{
            marginTop: 40,
            fontSize: 40,
            fontWeight: 700,
            color: "#8B95A1",
            letterSpacing: "8px",
          }}
        >
          정책알리미
        </div>
      </div>
    ),
    {
      width: 600,
      height: 600,
      fonts: [
        {
          name: "Pretendard",
          data: fontData,
          weight: 800,
          style: "normal",
        },
      ],
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
}
