// ============================================================
// keepioo 블로그 → 네이버 블로그 형식 변환
// ============================================================
// 네이버 블로그 에디터는 plain text 를 잘 받지만 HTML 직접 붙여넣기는
// 일반 사용자 모드에서 잘 안 됨 (markdown 자동 변환 X). 이 모듈은 keepioo
// 의 HTML 본문을 네이버 에디터가 깔끔하게 받는 plain text 로 변환한다.
//
// 변환 규칙:
//   <h2> "제목"            → "📍 제목" + 빈 줄
//   <h3> "소제목"          → "▶ 소제목" + 빈 줄
//   <ul><li>x</li></ul>    → "• x" 줄
//   <ol><li>x</li></ol>    → "1. x" / "2. x" / ...
//   <table>                → "키: 값" 줄로 단순화 (네이버 plain text 는 표 약함)
//   <strong>x</strong>     → 그대로 (평문에서는 강조 X)
//   <a href="x">y</a>      → "y (x)"  (링크 가시성 위해 URL 도 같이)
//   <p>x</p>               → x + 빈 줄
//   <br>                   → 줄바꿈
//
// keepioo 백링크 자동 삽입:
//   본문 끝에 keepioo 상세 페이지 URL + 출처 footer
//   네이버 SEO 신호 + 도메인 권위 백링크 효과
// ============================================================

export type BlogPostForNaver = {
  /** keepioo blog_posts.slug — 백링크 URL 조립용 */
  slug: string;
  /** 글 제목 (네이버 글쓰기 페이지 제목 필드) */
  title: string;
  /** 본문 HTML (sanitize 된 상태로 들어옴) */
  content: string;
  /** SEO meta_description — 본문 전 도입부로 활용 */
  meta_description: string | null;
  /** 카테고리 (예: 청년, 소상공인) — 네이버 블로그 카테고리 매칭 안내용 */
  category: string | null;
};

export type NaverBlogPayload = {
  /** 네이버 글쓰기 페이지의 "제목" 필드에 입력 */
  title: string;
  /** 네이버 글쓰기 페이지의 "본문" 영역에 붙여넣기 — plain text */
  body: string;
  /** keepioo 상세 페이지 URL — 백링크 추적용 (본문에도 이미 포함) */
  backlinkUrl: string;
};

const BASE_URL = "https://www.keepioo.com";

/**
 * keepioo HTML 본문을 네이버 에디터 호환 plain text 로 변환.
 *
 * 네이버 에디터의 동작 (실측 기준):
 *  - 일반 plain text 줄바꿈은 단락으로 인식 ✓
 *  - HTML 태그 직접 입력하면 그대로 텍스트로 표시됨 ✗ → 모두 평문화 필요
 *  - URL 평문은 자동 링크화 ✓ → href 는 단순히 URL 만 노출
 *  - 이모지 ✓ (네이버 블로그는 이모지 허용)
 */
export function convertToNaverBlog(post: BlogPostForNaver): NaverBlogPayload {
  const backlinkUrl = `${BASE_URL}/blog/${post.slug}`;

  // 1) 도입부 — meta_description 이 있으면 첫 단락으로
  const intro = post.meta_description
    ? `${post.meta_description.trim()}\n\n`
    : "";

  // 2) 본문 변환
  const bodyText = htmlToNaverText(post.content);

  // 3) 백링크 footer (keepioo SEO 효과 핵심)
  const footer = [
    "",
    "─────────────────────────",
    "📌 더 자세한 자격·금액·신청 방법",
    `→ ${backlinkUrl}`,
    "",
    "정책알리미 keepioo 에서는 매일 새 정부 정책을 자동으로 정리해 드려요.",
    "1분 자격 진단으로 사장님이 받을 수 있는 정책을 즉시 확인할 수 있어요.",
    `→ ${BASE_URL}/recommend`,
    "─────────────────────────",
  ].join("\n");

  const body = (intro + bodyText + footer).trim();

  return {
    title: post.title,
    body,
    backlinkUrl,
  };
}

/**
 * HTML → 네이버 plain text 변환 핵심.
 * 정규식 기반 — 외부 패키지 없이 가벼움. keepioo blog 의 sanitize 된 HTML 만
 * 처리하므로 보수적인 변환만 적용 (XSS/escaping 은 sanitize 에서 이미 처리).
 */
function htmlToNaverText(html: string): string {
  let text = html;

  // 표는 가장 변환 어려움 — keepioo 블로그의 정책 정보 표 패턴:
  // <table><tr><th>키</th><td>값</td></tr>...</table>
  // → "키: 값" 줄로 평면화
  text = text.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, inner: string) => {
    const rows: string[] = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(inner)) !== null) {
      const cells = [...rowMatch[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
        .map((m) => stripTags(m[1]).trim())
        .filter(Boolean);
      if (cells.length === 2) rows.push(`${cells[0]}: ${cells[1]}`);
      else if (cells.length > 0) rows.push(cells.join(" | "));
    }
    return "\n" + rows.join("\n") + "\n";
  });

  // 헤딩 — 네이버 plain text 는 # 같은 markdown 처리 X 라서
  // 이모지·기호로 시각적 구분 (네이버 블로그 본문에서도 가독성 OK)
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n📍 $1\n");
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n▶ $1\n");
  text = text.replace(/<h[1456][^>]*>([\s\S]*?)<\/h[1456]>/gi, "\n$1\n");

  // 리스트 — <ul> 은 • / <ol> 은 번호
  text = text.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner: string) => {
    const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(
      (m) => `• ${stripTags(m[1]).trim()}`,
    );
    return "\n" + items.join("\n") + "\n";
  });
  text = text.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner: string) => {
    const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(
      (m, idx) => `${idx + 1}. ${stripTags(m[1]).trim()}`,
    );
    return "\n" + items.join("\n") + "\n";
  });

  // 링크 — "텍스트 (URL)" 형태로 (네이버 plain text 는 자동 링크화 작동)
  text = text.replace(
    /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, url: string, label: string) => {
      const cleanLabel = stripTags(label).trim();
      // 백링크 footer 와 중복되는 keepioo 내부 링크는 단순 텍스트만 (이중 링크 방지)
      if (url.startsWith("/") || url.includes("keepioo.com")) {
        return cleanLabel;
      }
      return `${cleanLabel} (${url})`;
    },
  );

  // 단락 — <p> 는 빈 줄 1개 추가
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n");

  // <br> 줄바꿈
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // strong/em/b/i — 평문화 (네이버 plain text 는 인라인 강조 X)
  text = stripTags(text);

  // HTML 엔티티 디코딩
  text = decodeBasicEntities(text);

  // 연속 빈 줄 3개 이상 → 2개로 normalize
  text = text.replace(/\n{3,}/g, "\n\n");

  // 공백 trim (각 줄 trailing space 제거)
  text = text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

  return text;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
