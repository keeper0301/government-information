// ============================================================
// 네이버 블로그 썸네일 자동 생성 — 1080×1080 정방형
// ============================================================
// /api/naver-thumbnail/{slug} → 1080×1080 PNG (1:1 square).
//
// 네이버 블로그 검색·이웃 피드의 썸네일은 1:1 정방형이 기본.
//   - 16:9 사용 시 위아래 잘려 피사체 반쪽 (실측 결과)
//   - 800×800 이상 (PNG, 1MB 이하) 권장
//
// keepioo 의 instagram-card 디자인 (카테고리 컬러·Pretendard) 재활용 +
// 1080×1080 사이즈로 네이버 잘림 회피 (2026-05-13 신규).
//
// Extension 의 content.js 가 본문 paste 직전 base64 fetch → clipboard image
// → SE3 자동 upload. 첫 본문 이미지 = 자동 썸네일.
// ============================================================

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  getCategoryColor,
  categoryBadgeTextColor,
} from "@/lib/instagram/card-colors";

// 카테고리 색상 표는 lib/instagram/card-colors 에서 공유 (인스타 카드와 일관).
// 폴더명이 인스타지만 OG·네이버 썸네일 등 이미지 생성 공용 표.
// Dead code 2 경로 anti-pattern 차단 (2026-05-16 cleanup).

export const runtime = "nodejs";

let fontDataPromise: Promise<Buffer> | null = null;
function loadFontData(): Promise<Buffer> {
  if (!fontDataPromise) {
    fontDataPromise = readFile(join(process.cwd(), "assets/Pretendard-Bold.woff"));
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
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await params;
  const slug = safeDecodeSlug(rawSlug);
  if (!slug) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: post } = await supabase
    .from("blog_posts")
    .select("title, meta_description, category")
    .eq("slug", slug)
    .maybeSingle();

  if (!post) {
    return NextResponse.json({ error: "post not found" }, { status: 404 });
  }

  const category = post.category || "정책";
  const color = getCategoryColor(category);
  const fontData = await loadFontData();
  // 1080×1080 (1:1 square) — 네이버 블로그 썸네일 최적 (검색 결과 SEO 기준)
  const size = { width: 1080, height: 1080 };

  // hook = meta_description 첫 50자 (없으면 빈 string)
  const hook = (post.meta_description ?? "").trim().slice(0, 50);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "#FFFFFF",
          padding: "100px 90px",
          fontFamily: "Pretendard",
          position: "relative",
        }}
      >
        {/* 좌측 컬러 바 — instagram-card 디자인 시리즈 톤 통일 */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            top: 0,
            width: 16,
            height: "100%",
            background: color,
          }}
        />

        {/* 상단 카테고리 라벨 — 노년·문화 + white text 미달 (인스타 카드 1 과
            같은 패턴) 이라 categoryBadgeTextColor 분기 (2026-05-16 fix). */}
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            padding: "16px 36px",
            background: color,
            color: categoryBadgeTextColor(color),
            fontSize: 36,
            fontWeight: 800,
            borderRadius: 999,
            marginBottom: 60,
          }}
        >
          {category}
        </div>

        {/* 큰 제목 — 모바일 검색 결과 120px 영역에서도 읽힘.
            정사각형 1080×1080 라 글자 크기 임계 instagram-card 보다 약간 작게. */}
        <div
          style={{
            fontSize:
              post.title.length > 50
                ? 50
                : post.title.length > 40
                  ? 58
                  : post.title.length > 30
                    ? 68
                    : post.title.length > 15
                      ? 80
                      : 92,
            fontWeight: 800,
            color: "#191F28",
            lineHeight: 1.4,
            letterSpacing: "-0.5px",
            width: "100%",
            display: "flex",
            flexWrap: "wrap",
            wordBreak: "keep-all",
          }}
        >
          {post.title}
        </div>

        {/* hook — meta_description 짧게 (있으면) */}
        {hook && (
          <div
            style={{
              fontSize: 28,
              fontWeight: 500,
              color: "#4E5968",
              marginTop: 36,
              lineHeight: 1.5,
              letterSpacing: "-0.3px",
              display: "flex",
              flexWrap: "wrap",
              wordBreak: "keep-all",
            }}
          >
            {hook}
          </div>
        )}

        {/* 하단 keepioo 브랜드 + URL */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: 70,
            left: 90,
            right: 90,
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 28,
            color: "#8B95A1",
            fontWeight: 600,
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                width: 12,
                height: 12,
                background: color,
                borderRadius: 999,
                marginRight: 12,
              }}
            />
            keepioo.com
          </div>
          <div style={{ display: "flex" }}>1분 진단</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Pretendard", data: fontData, style: "normal", weight: 700 }],
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
      },
    },
  );
}
