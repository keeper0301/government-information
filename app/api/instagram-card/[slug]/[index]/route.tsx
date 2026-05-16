// ============================================================
// 인스타그램 카드뉴스 자동 생성
// ============================================================
// /api/instagram-card/{slug}/{index} → 1080×1350 PNG (4:5 portrait).
// index 1·2·3 = 표지·자격금액·신청방법 (3 카드 구조).
//
// 사용처:
//   /admin/instagram 페이지의 미리보기 + 다운로드.
//   /api/cron/instagram-publish 가 carousel 자동 발행에 사용.
//
// 디자인 (인스타 2026 가독성·노출 최적화):
//   - 1080×1350 (4:5 portrait) — 인스타 공식 carousel 권장 ratio
//     · 피드에서 1:1 square 대비 ~25% 더 큰 vertical 공간 → engagement ↑
//     · 프로필 grid (3:4) 에서 약간 trim 되지만 핵심 콘텐츠 가운데에 배치돼 안전
//     · carousel 첫 슬라이드 ratio 가 전체 결정 → 모든 카드 동일 사이즈 필수
//   - 큰 글씨 (모바일 화면 작은 글자 안 보임)
//   - 카테고리별 색상 (블로그 OG 와 동일 팔레트)
//   - 하단 keepioo 브랜드 + URL
// ============================================================

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  preserveSemanticChunks,
  tokenizeSemantic,
  splitSentences,
} from "@/lib/instagram/card-text";
import {
  getCategoryColor,
  categoryTextColor,
  categoryBadgeTextColor,
  categoryColorOnWhite,
} from "@/lib/instagram/card-colors";

export const runtime = "nodejs";

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
  const color = getCategoryColor(category);
  const fontData = await loadFontData();
  // 1080×1350 (4:5 portrait) — 2026 인스타 carousel 공식 권장 ratio
  const size = { width: 1080, height: 1350 };

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
        padding: "120px 90px",
        fontFamily: "Pretendard",
        position: "relative",
      }}
    >
      {/* 좌측 컬러 바 — carousel 시리즈 톤 통일 (cover/cta 동일 width 16)
          padding 90 안에 16 라 카드 너비 1.5% 의 subtle accent line */}
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

      {/* 상단 카테고리 라벨 — 노년 #FE9800·문화 #EAB308 처럼 매우 밝은 배경
          위에 white text 가 WCAG contrast 미달 (2.0/1.86:1). YIQ > 150
          분기로 dark text 자동 적용 (2026-05-16 fix). */}
      <div
        style={{
          display: "flex",
          alignSelf: "flex-start",
          padding: "14px 32px",
          background: color,
          color: categoryBadgeTextColor(color),
          fontSize: 32,
          fontWeight: 700,
          borderRadius: 999,
          marginBottom: 80,
          letterSpacing: "0",
        }}
      >
        {category}
      </div>

      {/* 큰 제목 — 인스타 모바일 가독성 최우선
          2026-05-16 사장님 가독성 신고 후 카드 2 와 동일 칸띄움 적용:
          letter-spacing 0 (음수 자간 제거) + line-height 1.55 (제목용 호흡감)
          + fontWeight 700 (Pretendard-Bold 실 weight, fake-bold 두꺼움 X) */}
      <div
        style={{
          // fontSize 임계 — 한 단계 낮춤 (구두점만 다음 줄로 떨어지는 사고 방지).
          // 한글 + 영문 구두점 ("주목!") 이 Satori 에서 별개 word 로 처리되어
          // "!" 만 over-flow 됨. fontSize ↓ → 한 줄 글자 수 ↓ → "주목!" 통째
          // 줄바꿈 가능. (2026-05-16 ulsan title 검수 사고)
          // fontSize 임계 한 단계 ↓ (orphan word 사고 + 긴 title 호흡감)
          fontSize:
            title.length > 50
              ? 40
              : title.length > 40
                ? 48
                : title.length > 30
                  ? 56
                  : title.length > 15
                    ? 72
                    : 84,
          fontWeight: 700,
          color: "#191F28",
          lineHeight: 1.55,
          letterSpacing: "0",
          flex: 1,
          width: "100%",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          wordBreak: "keep-all",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            width: "100%",
            alignItems: "baseline",
          }}
        >
          {tokenizeSemantic(title).map((t, j, arr) => (
            <div
              key={j}
              style={{
                display: "flex",
                marginRight: j === arr.length - 1 ? 0 : "0.32em",
                marginBottom: "0.32em",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>

      {/* 하단 브랜드 — 3 카드 통일 (fontSize 30·weight 700).
          white 배경 위 카테고리 brand color text 라 노년·문화 contrast 미달
          → categoryColorOnWhite 로 darker shade 분기 (2026-05-16 fix). */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          fontSize: 30,
          color: categoryColorOnWhite(color),
          fontWeight: 700,
          marginTop: 60,
          letterSpacing: "0",
        }}
      >
        @ keepioo · 정책알리미
      </div>
    </div>
  );
}

// 카드 텍스트 처리 (preserveSemanticChunks·tokenizeSemantic·splitSentences)
// 는 lib/instagram/card-text 로 분리 (단위 테스트 가능).

/**
 * 카드 2: 핵심 정보 — meta_description 큰 글씨로 (자격·금액·마감 hook).
 *
 * 가독성 (2026-05-16 사장님 사진 신고 → 단락 break 0 사고):
 *   - 한 단락 줄줄이 흐름 → 문장별 split + flex gap 으로 단락 break
 *   - 첫 문장 큰 글씨 (hook), 나머지 작게 + opacity 0.92 (시각 hierarchy)
 *   - line-height 1.45 (gap 으로 단락 break 별도라 줄 안 빽빽 ↓)
 *   - justifyContent center — 짧은 텍스트도 카드 가운데 정렬
 */
function renderInfoCard(
  title: string,
  description: string | null,
  color: string,
) {
  const text = description ?? title;
  const sentences = splitSentences(text, 3).map(preserveSemanticChunks);
  const longest = Math.max(...sentences.map((s) => s.length));

  // fontSize 임계 — 가장 긴 한 문장 길이 기준 (전체 길이 X)
  // 1080 - padding 200 = 880px width. 한 글자 폭 ≈ fontSize × 1.0 (한글).
  // letter-spacing 0.5px 양수 + line-height 1.7 의 호흡감을 고려해 약간 작게.
  const headFontSize =
    longest > 50 ? 38 : longest > 40 ? 44 : longest > 30 ? 50 : longest > 20 ? 58 : 68;
  const bodyFontSize = Math.round(headFontSize * 0.82);

  // 배경색이 밝으면 (노년 #FE9800·문화 #EAB308) 흰 글씨가 WCAG contrast 미달.
  // YIQ luminance 130 threshold 분기 (lib/instagram/card-colors).
  const bodyColor = categoryTextColor(color);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: color,
        padding: "120px 100px",
        fontFamily: "Pretendard",
      }}
    >
      {/* 💡 핵심 정보 pill — white bg + category color text. 노년·문화는
          contrast 미달이라 darker shade 분기 (2026-05-16 fix). */}
      <div
        style={{
          display: "flex",
          alignSelf: "flex-start",
          padding: "14px 30px",
          background: "#FFFFFF",
          color: categoryColorOnWhite(color),
          fontSize: 30,
          fontWeight: 700,
          borderRadius: 999,
          marginBottom: 60,
        }}
      >
        💡 핵심 정보
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 56,
          flex: 1,
          width: "100%",
          maxWidth: "100%",
          justifyContent: "center",
        }}
      >
        {sentences.map((sentence, i) => {
          const fontSize = i === 0 ? headFontSize : bodyFontSize;
          const tokens = tokenizeSemantic(sentence);
          // 각 token 이 atomic flex item — 한 chunk 안에서는 wrap X.
          // flex-wrap: wrap 으로 chunk 단위 자연 줄바꿈.
          // 의미 단위 ("최대 300만원") 가 절대 분리 안 됨 (2026-05-16 사장님 신고 fix).
          return (
            <div
              key={i}
              style={{
                display: "flex",
                flexWrap: "wrap",
                fontSize,
                fontWeight: 700,
                color: bodyColor,
                opacity: i === 0 ? 1 : 0.92,
                width: "100%",
              }}
            >
              {tokens.map((t, j) => (
                <div
                  key={j}
                  style={{
                    display: "flex",
                    marginRight: j === tokens.length - 1 ? 0 : "0.32em",
                    marginBottom: "0.4em",
                    letterSpacing: "0",
                  }}
                >
                  {t}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 30,
          color: bodyColor,
          opacity: 0.9,
          fontWeight: 700,
          marginTop: 40,
          letterSpacing: "0",
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
        padding: "120px 90px",
        fontFamily: "Pretendard",
        position: "relative",
      }}
    >
      {/* 좌측 컬러 바 — cover 카드와 동일 width 16 (carousel 톤 통일) */}
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

      {/* 본문 cluster — vertical center (카드 2 와 동일 패턴, 시각 일관성)
          안내 → keepioo.com → 1분 진단 3 chunks 사이 gap 으로 호흡감 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          width: "100%",
          justifyContent: "center",
          alignItems: "flex-start",
          gap: 48,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 52,
            fontWeight: 700,
            color: "#191F28",
            lineHeight: 1.6,
            letterSpacing: "0",
            wordBreak: "keep-all",
          }}
        >
          ✅ 자세한 자격·금액·신청 방법은
        </div>

        {/* keepioo.com — 영문이라 letterSpacing -0.5px 정도는 typography 느낌.
            fontSize 92 라도 노년·문화는 white bg + brand color = 1.86~2.0:1
            미달이라 categoryColorOnWhite 분기 (2026-05-16 fix). */}
        <div
          style={{
            display: "flex",
            fontSize: 92,
            fontWeight: 700,
            color: categoryColorOnWhite(color),
            lineHeight: 1.2,
            letterSpacing: "-0.5px",
            wordBreak: "keep-all",
          }}
        >
          keepioo.com
        </div>

        {/* 2줄 구성 — line-height 1.7 + 줄 사이 marginTop 28 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 42,
            fontWeight: 700,
            color: "#4E5968",
            lineHeight: 1.7,
            letterSpacing: "0",
            wordBreak: "keep-all",
          }}
        >
          <div style={{ display: "flex" }}>🔍 1분 자격 진단으로</div>
          <div style={{ display: "flex", marginTop: 28 }}>
            받을 수 있는 정책 즉시 확인
          </div>
        </div>
      </div>

      {/* 하단 brand — 3 카드 통일 (fontSize 30·weight 700).
          white bg 위 brand color → categoryColorOnWhite 분기 (2026-05-16 fix). */}
      <div
        style={{
          display: "flex",
          fontSize: 30,
          color: categoryColorOnWhite(color),
          fontWeight: 700,
          letterSpacing: "0",
        }}
      >
        프로필 링크 → keepioo.com
      </div>
    </div>
  );
}
