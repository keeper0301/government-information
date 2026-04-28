// ============================================================
// /blog/category/[category] 동적 OG 이미지 (1200 × 630)
// ============================================================
// 카테고리명 + 발행 글 카운트 동적 노출. 카테고리별 보색 emerald accent.
// publish-blog 매일 7글 → 카운트가 빠르게 증가하므로 매번 fresh.
// ============================================================

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "정책 카테고리 가이드 · keepioo 정책알리미";

const CATEGORY_LABEL: Record<string, string> = {
  "청년": "청년 정책 가이드",
  "노년": "노년 정책 가이드",
  "학생·교육": "학생·교육 지원 가이드",
  "육아·가족": "육아·가족 정책 가이드",
  "주거": "주거 지원 가이드",
  "소상공인": "소상공인 정책 가이드",
  "건강·복지": "건강·복지 정책 가이드",
};

let fontDataPromise: Promise<Buffer> | null = null;
function loadFontData(): Promise<Buffer> {
  if (!fontDataPromise) {
    fontDataPromise = readFile(join(process.cwd(), "assets/Pretendard-Bold.woff"));
  }
  return fontDataPromise;
}

export default async function OgImage({ params }: { params: { category: string } }) {
  const category = decodeURIComponent(params.category);
  const fontData = await loadFontData();

  let postCount = 0;
  try {
    const supabase = await createClient();
    const { count } = await supabase
      .from("blog_posts")
      .select("slug", { count: "exact", head: true })
      .eq("category", category)
      .not("published_at", "is", null);
    postCount = count ?? 0;
  } catch {
    // OG 이미지 fetch 실패는 무시
  }

  const title = CATEGORY_LABEL[category] ?? `${category} 정책 가이드`;
  const subtitle = postCount > 0 ? `${postCount.toLocaleString()}글 · 매일 새 가이드 발행` : "매일 새 가이드 발행";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #ECFDF5 0%, #FFFFFF 60%, #D1FAE5 100%)",
          display: "flex",
          flexDirection: "column",
          padding: "88px 96px",
          fontFamily: "Pretendard",
          color: "#191F28",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1.5, display: "flex" }}>
            <span style={{ color: "#191F28" }}>keepi</span>
            <span style={{ color: "#3182F6" }}>oo</span>
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#8B95A1",
              paddingLeft: 16,
              borderLeft: "2px solid #E5E8EB",
              alignSelf: "center",
            }}
          >
            정책 블로그
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", marginTop: 20 }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "#10B981",
              marginBottom: 16,
              letterSpacing: -0.5,
            }}
          >
            카테고리별 정책 가이드
          </div>
          <div
            style={{
              fontSize: 88,
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: -3,
              color: "#191F28",
              wordBreak: "keep-all",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: "#4E5968",
              marginTop: 24,
              letterSpacing: -0.5,
            }}
          >
            {subtitle}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            color: "#8B95A1",
            fontWeight: 600,
            paddingTop: 28,
            borderTop: "1px solid #E5E8EB",
          }}
        >
          <span>자격·신청 방법·실제 사례 정리</span>
          <span style={{ color: "#3182F6" }}>keepioo.com</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Pretendard", data: fontData, style: "normal", weight: 700 }],
    },
  );
}
