// ============================================================
// 인스타그램 카드뉴스 자동 생성
// ============================================================
// /api/instagram-card/{slug}/{index} → 1080×1080 PNG.
// index 1·2·3 = 표지·자격금액·신청방법 (3 카드 구조).
//
// 사용처:
//   /admin/instagram 페이지의 미리보기 + 다운로드.
//   사장님이 ZIP 다운로드 → 인스타 멀티이미지 게시.
//
// 디자인 (인스타 가독성 최적화):
//   - 1080×1080 정사각형 (인스타 권장)
//   - 큰 글씨 (모바일 화면 작은 글자 안 보임)
//   - 카테고리별 색상 (블로그 OG 와 동일 팔레트)
//   - 하단 keepioo 브랜드 + URL
// ============================================================

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// 카테고리 색상 — 블로그 OG 와 동일 (일관성)
const CATEGORY_COLORS: Record<string, string> = {
  청년: "#3182F6",
  소상공인: "#A234C7",
  주거: "#03B26C",
  "육아·가족": "#EC4899",
  노년: "#FE9800",
  "학생·교육": "#18A5A5",
  큐레이션: "#6B7684",
};

// Pretendard 폰트 — 모듈 캐시 (cold start 후 1회 로드)
let fontDataPromise: Promise<Buffer> | null = null;
function loadFontData(): Promise<Buffer> {
  if (!fontDataPromise) {
    fontDataPromise = readFile(
      join(process.cwd(), "assets/Pretendard-Bold.woff"),
    );
  }
  return fontDataPromise;
}

function safeDecodeSlug(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; index: string }> },
) {
  const { slug: rawSlug, index } = await params;
  const slug = safeDecodeSlug(rawSlug);
  const cardIndex = parseInt(index, 10);

  if (!slug || ![1, 2, 3].includes(cardIndex)) {
    return NextResponse.json(
      { error: "invalid slug or index (1·2·3)" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: post } = await supabase
    .from("blog_posts")
    .select("title, meta_description, category, tags, faqs")
    .eq("slug", slug)
    .maybeSingle();

  if (!post) {
    return NextResponse.json({ error: "post not found" }, { status: 404 });
  }

  const category = post.category || "정책";
  const color = CATEGORY_COLORS[category] || "#3182F6";
  const fontData = await loadFontData();
  const size = { width: 1080, height: 1080 };

  // 카드별 다른 layout 으로 생성 (3 카드 동시 보이는 일관된 시리즈 디자인)
  const cardElement =
    cardIndex === 1
      ? renderCoverCard(post.title, category, color)
      : cardIndex === 2
        ? renderInfoCard(post.title, post.meta_description, color)
        : renderCtaCard(post.title, color);

  return new ImageResponse(cardElement, {
    ...size,
    fonts: [
      { name: "Pretendard", data: fontData, style: "normal", weight: 700 },
    ],
  });
}

/**
 * 카드 1: 표지 — 정책 제목 + 카테고리 + hook.
 * 사용자가 첫 인스타 피드에서 보는 가장 중요한 카드.
 */
function renderCoverCard(title: string, category: string, color: string) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "#FFFFFF",
        padding: "100px 80px",
        fontFamily: "Pretendard",
        position: "relative",
      }}
    >
      {/* 상단 카테고리 라벨 */}
      <div
        style={{
          display: "flex",
          alignSelf: "flex-start",
          padding: "16px 36px",
          background: color,
          color: "#FFFFFF",
          fontSize: 36,
          fontWeight: 800,
          borderRadius: 999,
          marginBottom: 60,
        }}
      >
        {category}
      </div>

      {/* 큰 제목 — 인스타 모바일 가독성 최우선 */}
      <div
        style={{
          fontSize: title.length > 30 ? 80 : 96,
          fontWeight: 800,
          color: "#191F28",
          lineHeight: 1.2,
          letterSpacing: "-3px",
          flex: 1,
          display: "flex",
          alignItems: "center",
          wordBreak: "keep-all",
        }}
      >
        {title}
      </div>

      {/* 하단 브랜드 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          fontSize: 36,
          color: color,
          fontWeight: 800,
          marginTop: 40,
        }}
      >
        @ keepioo · 정책알리미
      </div>
    </div>
  );
}

/**
 * 카드 2: 핵심 정보 — meta_description 큰 글씨로 (자격·금액·마감 hook).
 */
function renderInfoCard(
  title: string,
  description: string | null,
  color: string,
) {
  const text = description ?? title;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: color,
        padding: "100px 80px",
        fontFamily: "Pretendard",
      }}
    >
      <div
        style={{
          display: "flex",
          alignSelf: "flex-start",
          padding: "12px 28px",
          background: "#FFFFFF",
          color: color,
          fontSize: 32,
          fontWeight: 800,
          borderRadius: 999,
          marginBottom: 40,
        }}
      >
        💡 핵심 정보
      </div>

      <div
        style={{
          fontSize: text.length > 100 ? 56 : 64,
          fontWeight: 800,
          color: "#FFFFFF",
          lineHeight: 1.4,
          letterSpacing: "-2px",
          flex: 1,
          display: "flex",
          alignItems: "center",
          wordBreak: "keep-all",
        }}
      >
        {text}
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 32,
          color: "#FFFFFF",
          opacity: 0.9,
          fontWeight: 700,
        }}
      >
        @ keepioo · 정책알리미
      </div>
    </div>
  );
}

/**
 * 카드 3: CTA — keepioo 에서 자세히 확인하라는 안내.
 * 사장님 인스타 프로필 링크 (link in bio) 로 유도.
 */
function renderCtaCard(title: string, color: string) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "#FFFFFF",
        padding: "100px 80px",
        fontFamily: "Pretendard",
        position: "relative",
      }}
    >
      {/* 좌측 컬러 바 — Satori 요구: 모든 div 에 display 명시 */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          top: 0,
          width: 24,
          height: "100%",
          background: color,
        }}
      />

      <div
        style={{
          display: "flex",
          fontSize: 56,
          fontWeight: 800,
          color: "#191F28",
          lineHeight: 1.3,
          letterSpacing: "-2px",
          marginBottom: 40,
          wordBreak: "keep-all",
        }}
      >
        ✅ 자세한 자격·금액·신청 방법은
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 96,
          fontWeight: 800,
          color: color,
          lineHeight: 1.1,
          letterSpacing: "-3px",
          marginBottom: 60,
          wordBreak: "keep-all",
        }}
      >
        keepioo.com
      </div>

      {/* 2줄 구성 — Satori 는 <br /> 미지원, flex-direction:column 으로 2개 div 분리 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 44,
          fontWeight: 700,
          color: "#4E5968",
          lineHeight: 1.4,
          letterSpacing: "-1px",
          flex: 1,
          wordBreak: "keep-all",
        }}
      >
        <div style={{ display: "flex" }}>🔍 1분 자격 진단으로</div>
        <div style={{ display: "flex" }}>받을 수 있는 정책 즉시 확인</div>
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 36,
          color: color,
          fontWeight: 800,
        }}
      >
        프로필 링크 → keepioo.com
      </div>
    </div>
  );
}
