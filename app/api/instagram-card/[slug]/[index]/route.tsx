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

export const runtime = "nodejs";

// 카테고리 색상 — 블로그 OG 와 동일 (일관성)
const CATEGORY_COLORS: Record<string, string> = {
  청년: "#3182F6",
  소상공인: "#A234C7",
  주거: "#03B26C",
  "육아·가족": "#EC4899",
  노년: "#FE9800",
  "학생·교육": "#18A5A5",
  문화: "#EAB308", // gold — 문화재 톤, 다른 카테고리와 차별 (2026-05-14 review 정리)
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

      {/* 상단 카테고리 라벨 */}
      <div
        style={{
          display: "flex",
          alignSelf: "flex-start",
          padding: "14px 32px",
          background: color,
          color: "#FFFFFF",
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

      {/* 하단 브랜드 — 3 카드 통일 (fontSize 30·weight 700) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          fontSize: 30,
          color: color,
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

/**
 * 의미 단위 (semantic chunk) 줄바꿈 방지 — 2026-05-16 사장님 신고:
 * "최대 300만원" 이 "최대 300" / "만원" 으로 줄바꿈되면 한 눈에 인식 X.
 * 숫자/금액 같은 의미 단위는 한 줄에 같이 보여야 가독성 ↑.
 *
 * NBSP ( ) 는 CSS 에서 줄바꿈 안 일어남 (Satori 도 동일).
 *
 * 룰:
 *  1) "20만 원" 같이 단위 사이 공백 → "20만원" 통일
 *  2) 강조 부사 + 숫자 ("최대 300", "월 20") → 묶음
 *  3) 숫자 + 한글 단위 ("24 개월", "5 명") → 묶음
 *
 * "3월 30일" 의 "월 30" 같이 부사 아닌 위치 매칭 방지 위해
 * 부사 룰에 negative lookbehind (?<![가-힣\d]) 사용.
 */
function preserveSemanticChunks(text: string): string {
  // "20만 원" / "20 만 원" → "20만원" 통일만. nowrap chunk 는 tokenizeSemantic 에서.
  return text
    .replace(/(\d+(?:\.\d+)?)\s*만\s*원/gu, "$1만원")
    .replace(/(\d+(?:\.\d+)?)\s*억\s*원/gu, "$1억원");
}

/**
 * 문장을 의미 단위 atomic chunk 로 split — flex item 으로 렌더링하면 각 chunk
 * 가 atomic block 이라 wrap 시 chunk 단위 줄바꿈. 한 chunk 안에서는 break X.
 *
 * Satori 가 NBSP (\u00A0) / Word Joiner (\u2060) 를 무시하는 사고 (2026-05-16
 * 사장님 신고) 근본 해소.
 *
 * 룰:
 *  1) 어절 (공백) 단위 split
 *  2) 강조 부사 ("최대") 다음에 숫자 어절 ("300만원") 오면 합쳐서 한 chunk
 *  3) "최대 300만원" / "월 20만원" / "약 5명" 같이 의미 단위 보존
 */
function tokenizeSemantic(text: string): string[] {
  const ADVERBS =
    /^(최대|최소|총|약|평균|매월|매일|매년|매주|연간|월간|주간|분기별|월|일|주|연)$/u;
  const NUMERIC_START = /^\d/u;
  const tokens = text.split(/\s+/u).filter(Boolean);
  const merged: string[] = [];
  for (const t of tokens) {
    const prev = merged[merged.length - 1];
    if (prev && ADVERBS.test(prev) && NUMERIC_START.test(t)) {
      merged[merged.length - 1] = `${prev} ${t}`;
    } else {
      merged.push(t);
    }
  }
  // orphan 결합 — 마지막 token 이 3 글자 이하 (예: "복지", "방법", "조성") 면
  // 이전 token 과 합쳐서 한 chunk. 긴 title 의 마지막 단어가 외롭게 한 줄
  // 차지하는 사고 (2026-05-16 광주 광산구 카드 1) 방지.
  if (merged.length >= 2) {
    const last = merged[merged.length - 1];
    if (last.length <= 3 && !NUMERIC_START.test(last)) {
      merged[merged.length - 2] = `${merged[merged.length - 2]} ${last}`;
      merged.pop();
    }
  }
  return merged;
}
/**
 * meta_description 을 문장별로 분리 — 카드 2 가독성 fix (2026-05-16).
 * 한국어 종결형 (~다·~요·~까?) + 영어 .!? 모두 cover. max 문장 cap 으로
 * 매우 긴 description 도 카드 안에 안전하게 들어감.
 *
 * Note: split 정규식의 \s+ 는 NBSP 미포함 (실제로 [ \t\n] 만 매칭) — 안전.
 * 단, 명시적으로 [ \t]+ 사용해서 NBSP 안 잘리는 것 보장.
 */
function splitSentences(text: string, max: number): string[] {
  const parts = text
    .split(/(?<=[다요까])\.[ \t]+|(?<=[.!?])[ \t]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return [text.trim()];
  return parts.slice(0, max);
}

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

  // 배경색 밝기 판정 — light 배경 (노년 #FE9800·학생·교육 #18A5A5) 위
  // 흰 글씨는 WCAG contrast fail (2.3:1·3.2:1) → 다크 텍스트로 분기.
  // YIQ luminance 공식 (0~255) — threshold 130 으로 두 카테고리 정확히 분리.
  const isLightBg = (() => {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 130;
  })();
  const bodyColor = isLightBg ? "#191F28" : "#FFFFFF";

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
      <div
        style={{
          display: "flex",
          alignSelf: "flex-start",
          padding: "14px 30px",
          background: "#FFFFFF",
          color: color,
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

        {/* keepioo.com — 영문이라 letterSpacing -0.5px 정도는 typography 느낌 */}
        <div
          style={{
            display: "flex",
            fontSize: 92,
            fontWeight: 700,
            color: color,
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

      {/* 하단 brand — 3 카드 통일 (fontSize 30·weight 700) */}
      <div
        style={{
          display: "flex",
          fontSize: 30,
          color: color,
          fontWeight: 700,
          letterSpacing: "0",
        }}
      >
        프로필 링크 → keepioo.com
      </div>
    </div>
  );
}
