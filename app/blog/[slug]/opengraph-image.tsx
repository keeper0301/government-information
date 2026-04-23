// ============================================================
// 블로그 글 OG 이미지 자동 생성
// ============================================================
// Next.js 16 의 file convention (opengraph-image.tsx) 사용.
// 빌드 시점이 아닌 요청 시점에 동적 생성 (글마다 다른 이미지).
// SNS 공유 시 (Twitter/Facebook/KakaoTalk) 미리보기 카드로 노출.
//
// 디자인:
//   - 카테고리별 색상 좌측 바 + 카테고리 라벨
//   - 글 제목 (대형)
//   - 푸터: "정책알리미 · keepioo.com"
//   - Pretendard 폰트 (한글 가독성 우수)
// ============================================================

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";

// Next.js 메타데이터 설정
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "정책알리미 블로그 글";

// Pretendard 폰트 데이터 — 모듈 스코프 캐시로 cold start 이후 디스크 I/O 1회만
let fontDataPromise: Promise<Buffer> | null = null;
function loadFontData(): Promise<Buffer> {
  if (!fontDataPromise) {
    fontDataPromise = readFile(
      join(process.cwd(), "assets/Pretendard-Bold.woff"),
    );
  }
  return fontDataPromise;
}

// 카테고리별 색상 (홈·블로그 인덱스 와 통일)
const CATEGORY_COLORS: Record<string, string> = {
  청년: "#3182f6",
  소상공인: "#7C3AED",
  주거: "#059669",
  "육아·가족": "#EC4899",
  노년: "#F59E0B",
  "학생·교육": "#06B6D4",
  큐레이션: "#6B7280",
};

// slug 한글 디코드 (Next.js 16 percent-encoded params 대응)
function safeDecodeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = safeDecodeSlug(rawSlug);

  // DB 에서 제목·카테고리 가져오기 (없으면 fallback)
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("blog_posts")
    .select("title, category")
    .eq("slug", slug)
    .maybeSingle();

  const title = post?.title || "정책알리미";
  const category = post?.category || "정책 가이드";
  const color = CATEGORY_COLORS[category] || "#3182f6";

  // Pretendard 폰트 — 프로젝트 루트의 assets/ 에서 정적 로드
  // (이전엔 매 요청마다 jsdelivr CDN fetch → 외부 의존 제거 + 디스크 I/O 1회 캐시)
  const fontData = await loadFontData();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "#ffffff",
          padding: "80px 70px",
          position: "relative",
          fontFamily: "Pretendard",
        }}
      >
        {/* 좌측 컬러 바 (카테고리 강조) */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 16,
            height: "100%",
            background: color,
          }}
        />

        {/* 카테고리 라벨 */}
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            padding: "12px 28px",
            background: color,
            color: "#ffffff",
            fontSize: 28,
            fontWeight: 700,
            borderRadius: 999,
            marginBottom: 40,
          }}
        >
          {category}
        </div>

        {/* 제목 — 줄바꿈은 satori 가 자동 처리 */}
        <div
          style={{
            fontSize: title.length > 35 ? 56 : 64,
            fontWeight: 800,
            color: "#191f28",
            lineHeight: 1.25,
            letterSpacing: "-1.5px",
            flex: 1,
            display: "flex",
            alignItems: "center",
            wordBreak: "keep-all",
          }}
        >
          {title}
        </div>

        {/* 푸터 — 브랜드 + URL */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 28,
            color: "#8b95a1",
            fontWeight: 600,
          }}
        >
          정책알리미 · keepioo.com
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
