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
  /** 대표 이미지 URL — 네이버 본문 첫 단락에 자동 첨부 (썸네일도 자동 선정됨) */
  cover_image?: string | null;
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
  const contentForNaver = prepareContentForNaver(post.content, post.meta_description);

  // 1) 도입부 — 광고문보다 검색 의도 답변을 먼저 보여준다.
  const intro = post.meta_description
    ? `${softenNaverMarketingCopy(post.meta_description.trim())}\n\n`
    : "";
  const keySummary = buildNaverKeySummaryText(contentForNaver);
  const trustChecklist = [
    "한눈에 보는 핵심",
    ...keySummary.map((item) => `• ${item}`),
    "",
    "신청 전 체크포인트",
    "• 대상: 나이·지역·소득 조건이 맞는지 확인",
    "• 혜택: 지원 금액과 실제 지급 방식을 확인",
    "• 기간: 신청 마감일과 예산 소진 여부 확인",
    "• 서류: 주민등록·소득·사업자 증빙 필요 여부 확인",
    "• 경로: 공식 신청 페이지에서 최종 조건 확인",
    "",
  ].join("\n");

  // 2) 본문 변환
  const bodyText = htmlToNaverText(contentForNaver);

  // 3) 백링크 footer (정보 보강형으로 낮은 광고감 유지)
  const footer = [
    "",
    "─────────────────────────",
    "공식 조건은 모집 시점·지역·예산에 따라 달라질 수 있어요.",
    "신청 전에는 반드시 해당 기관의 최신 공고를 한 번 더 확인하세요.",
    "",
    "자세한 자격·금액·신청 방법 정리",
    `→ ${backlinkUrl}`,
    "",
    "내 조건에 맞는 정책을 더 찾고 싶다면",
    `→ ${BASE_URL}/recommend`,
    "─────────────────────────",
  ].join("\n");

  const body = (intro + trustChecklist + bodyText + footer).trim();

  return {
    title: softenNaverMarketingCopy(post.title),
    body,
    backlinkUrl,
  };
}

/**
 * 네이버 외부 발행용 본문 전처리.
 * keepioo 원문에는 웹 상세 페이지용 목차/리드가 들어갈 수 있는데,
 * 네이버에는 meta hook과 핵심 요약을 별도로 넣기 때문에 그대로 두면 첫 화면이
 * 반복·템플릿처럼 보인다. 상세 정보 본문은 유지하고 낮은 가치의 목차/중복 리드만 뺀다.
 */
function prepareContentForNaver(html: string, metaDescription?: string | null): string {
  return removeLeadingParagraphSimilarToMeta(
    removeLowValueNaverSections(html),
    metaDescription,
  );
}

function removeLowValueNaverSections(html: string): string {
  // "이 글에서 확인할 수 있는 것"은 웹 페이지용 목차라 네이버 첫 화면에서는
  // 본문 앞 핵심 요약과 중복된다. 다음 h2 전까지만 제거한다.
  return html.replace(
    /<h2[^>]*>\s*이\s*글에서\s*확인할\s*수\s*있는\s*것\s*<\/h2>[\s\S]*?(?=<h2\b|$)/i,
    "",
  );
}

function removeLeadingParagraphSimilarToMeta(html: string, metaDescription?: string | null): string {
  const meta = normalizeComparableText(metaDescription ?? "");
  if (meta.length < 40) return html;
  return html.replace(/^(\s*<p[^>]*>)([\s\S]*?)(<\/p>\s*)/i, (match, open, inner, close) => {
    const paragraph = normalizeComparableText(decodeBasicEntities(stripTags(inner)));
    if (paragraph.length < 40) return match;
    const shorter = Math.min(meta.length, paragraph.length);
    const longer = Math.max(meta.length, paragraph.length);
    const commonPrefix = commonPrefixLength(meta, paragraph);
    const containment = meta.includes(paragraph.slice(0, Math.min(paragraph.length, 80))) ||
      paragraph.includes(meta.slice(0, Math.min(meta.length, 80)));
    if (commonPrefix / shorter >= 0.68 || (containment && shorter / longer >= 0.55)) {
      return "";
    }
    return `${open}${inner}${close}`;
  });
}

function normalizeComparableText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
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

function buildNaverKeySummaryText(html: string): string[] {
  const plain = decodeBasicEntities(stripTags(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n"),
  ))
    .replace(/\u00a0/g, " ")
    .split(/\n|(?<=[.!?。])\s+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const priority = [
    /대상|자격|조건|나이|연령|지역|소득|거주/,
    /지원|혜택|금액|만원|원\b|월\s*\d|최대/,
    /신청|접수|기간|마감|공식|홈페이지|누리집/,
    /서류|제출|증빙|문의|기관|센터/,
  ];
  const picked: string[] = [];
  for (const re of priority) {
    const line = plain.find((candidate) => candidate.length >= 18 && re.test(candidate) && !picked.includes(candidate));
    if (line) picked.push(softenNaverMarketingCopy(line).slice(0, 92));
  }
  if (picked.length < 3) {
    for (const line of plain) {
      if (picked.includes(line)) continue;
      picked.push(softenNaverMarketingCopy(line).slice(0, 92));
      if (picked.length >= 3) break;
    }
  }
  return picked.slice(0, 4);
}

// ============================================================
// Phase 2-A — RPA 자동 발행용 SE3 호환 HTML 변환
// ============================================================
// Playwright 가 네이버 SmartEditor 의 내부 iframe contenteditable 영역에
// HTML 직접 paste 하는 용도. plain text (위 convertToNaverBlog) 와 별개로
// HTML 구조 유지하면서 SE3 가 깔끔하게 파싱하는 형태로 출력.
//
// SE3 호환 규칙 (실측 + 공개 문서 기반):
//  - 인라인 스타일 (style="...") 은 SE3 자체 스타일로 덮어쓰기 됨 → 안 씀
//  - 표준 태그 (p, h3, ul, ol, li, a, strong, em) 만 사용
//  - <h3> 는 SE3 에서 소제목 단락으로 인식 (별도 글자크기 자동 설정)
//  - <table> 은 SE3 가 표 도구로 받으므로 그대로
//  - <p> 사이 빈 단락은 SE3 가 자동으로 정리
//
// Phase 3 cron 흐름:
//   1. convertToNaverBlogHtml(post) 호출 → SE3 HTML 문자열
//   2. clipboard 에 set (page.evaluate(navigator.clipboard.writeText))
//   3. SE3 본문 영역 클릭 → Ctrl+V
//   4. SE3 가 HTML paste 받아 자체 단락 구조로 파싱
// ============================================================

export type NaverBlogHtmlPayload = {
  /** 네이버 글쓰기 페이지의 "제목" 필드 — plain text 그대로 */
  title: string;
  /** SE3 contenteditable 에 paste 할 HTML */
  bodyHtml: string;
  /** keepioo 백링크 (footer 에 포함되지만 별도 노출용) */
  backlinkUrl: string;
  /** 썸네일·본문 head 이미지로 사용할 URL (없으면 null) */
  coverImageUrl: string | null;
};

/**
 * keepioo blog → 네이버 SE3 contenteditable 에 paste 할 HTML.
 *
 * 2026-05-12 강화 — SE3 paste 한계 회피:
 *   - SE3 가 paste 시 <h3>·<table>·<ul> 를 일반 paragraph 로 변환해버림
 *   - 시각적 강조 보존 위해 강제 변환:
 *     <h3> → <p><strong>📌 ...</strong></p>
 *     <table> 행 → <p><strong>라벨</strong>: 값</p>
 *     <ul><li> → <p>• 항목</p>
 *     <ol><li> → <p>1. 항목</p>
 *   - 도입부 hook 단락 추가 + 끝 CTA 강조
 *   - cover_image 있으면 첫 단락에 <img> 삽입 (SE3 가 외부 URL 자동 download)
 */
export function convertToNaverBlogHtml(
  post: BlogPostForNaver & { cover_image?: string | null },
): NaverBlogHtmlPayload {
  const backlinkUrl = `${BASE_URL}/blog/${post.slug}`;
  const contentForNaver = prepareContentForNaver(post.content, post.meta_description);
  // cover_image — 네이버 블로그 전용 1080×1080 정방형 (2026-05-13 신규).
  // /api/naver-thumbnail/{slug} = 카테고리 컬러 + 큰 제목 + hook + 키핍 브랜드.
  // 이전 cover_image (1200×630 OG) 는 16:9 라 네이버 검색 결과 위아래 잘림.
  // NAVER_DISABLE_COVER=true 로 비활성 가능 (debug fallback).
  const disableCover = process.env.NAVER_DISABLE_COVER === "true";
  const coverImageUrl = disableCover
    ? null
    : `${BASE_URL}/api/naver-thumbnail/${encodeURIComponent(post.slug)}`;

  // 1) 도입부 — 네이버 첫 화면에서 바로 답을 주는 정보형 구조.
  const hookHtml = post.meta_description
    ? `<p>${escapeHtml(softenNaverMarketingCopy(post.meta_description.trim()))}</p>\n<p>&nbsp;</p>\n`
    : "";
  const keySummaryHtml = [
    `<p><strong>한눈에 보는 핵심</strong></p>`,
    ...buildNaverKeySummaryText(contentForNaver).map((item) => `<p>• ${escapeHtml(item)}</p>`),
    `<p>&nbsp;</p>`,
  ].join("\n");
  const trustChecklistHtml = [
    `<p><strong>신청 전 체크포인트</strong></p>`,
    `<p>• 대상: 나이·지역·소득 조건이 맞는지 확인</p>`,
    `<p>• 혜택: 지원 금액과 실제 지급 방식을 확인</p>`,
    `<p>• 기간: 신청 마감일과 예산 소진 여부 확인</p>`,
    `<p>• 서류: 주민등록·소득·사업자 증빙 필요 여부 확인</p>`,
    `<p>• 경로: 공식 신청 페이지에서 최종 조건 확인</p>`,
    `<p>&nbsp;</p>`,
  ].join("\n");

  // 2) cover image — HTML <img> paste 는 SE3 가 외부 fetch 실패 시 alert 띄움 (2026-05-12 사고).
  //    runner.mjs 가 본문 paste 후 별도로 base64 image paste (SE3 자동 upload).
  //    여기서는 본문 HTML 에 안 넣고 빈 단락만 (이미지 자리 확보).
  const coverHtml = coverImageUrl
    ? `<p>&nbsp;</p>\n<p>&nbsp;</p>\n` // 이미지 paste 자리 — runner 가 첫 단락 앞에 paste
    : "";

  // 3) 본문 — SE3 안전 형식으로 변환
  const bodyContentHtml = transformForSe3(contentForNaver);

  // 4) CTA — 정보 확인 이후에만 낮은 광고감으로 배치.
  const ctaHtml = [
    `<p>&nbsp;</p>`,
    `<p><strong>━━━━━━━━━━━━━━━━━━</strong></p>`,
    `<p>공식 조건은 모집 시점·지역·예산에 따라 달라질 수 있어요.</p>`,
    `<p>신청 전에는 반드시 해당 기관의 최신 공고를 한 번 더 확인하세요.</p>`,
    `<p>&nbsp;</p>`,
    `<p><strong>자세한 자격·금액·신청 방법 정리</strong></p>`,
    `<p><a href="${escapeAttr(backlinkUrl)}">${escapeHtml(backlinkUrl)}</a></p>`,
    `<p>&nbsp;</p>`,
    `<p>내 조건에 맞는 정책을 더 찾고 싶다면</p>`,
    `<p><a href="${escapeAttr(BASE_URL)}/recommend">${escapeHtml(BASE_URL + "/recommend")}</a></p>`,
    `<p><strong>━━━━━━━━━━━━━━━━━━</strong></p>`,
  ].join("\n");

  const bodyHtml = (
    coverHtml +
    hookHtml +
    keySummaryHtml +
    "\n" +
    trustChecklistHtml +
    bodyContentHtml +
    "\n" +
    ctaHtml
  ).trim();

  return {
    title: softenNaverMarketingCopy(post.title),
    bodyHtml,
    backlinkUrl,
    coverImageUrl,
  };
}

/**
 * keepioo HTML → SE3 paste-safe HTML.
 * SE3 가 paste 시 <h3>·<table>·<ul> 등 무시하는 한계를 우회:
 * 모두 <p> 단락 + emoji/strong 으로 강제 변환해 시각적 강조 보존.
 */
function transformForSe3(html: string): string {
  let result = html;

  // 1) script·style 제거
  result = result.replace(/<script[\s\S]*?<\/script>/gi, "");
  result = result.replace(/<style[\s\S]*?<\/style>/gi, "");

  // 2) inline style·class·id 제거 (SE3 가 자체 스타일 적용)
  result = result.replace(/\s+(?:style|class|id)=["'][^"']*["']/gi, "");

  // 3) <h2>·<h3>·<h4> → <p><strong>📌 ...</strong></p> + 빈 줄.
  //    SE3 가 paste 시 h3 무시하지만 strong + emoji 는 보존 → 시각 강조 OK.
  for (const lvl of ["h2", "h3", "h4"] as const) {
    const re = new RegExp(`<${lvl}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${lvl}>`, "gi");
    result = result.replace(re, (_, inner: string) => {
      const cleaned = stripTags(inner).trim();
      return `<p>&nbsp;</p>\n<p><strong>📌 ${cleaned}</strong></p>\n`;
    });
  }

  // 4) <table> → 행별 "라벨: 값" 단락 (SE3 가 table 무시 회피)
  result = result.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, inner: string) => {
    const rows: string[] = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(inner)) !== null) {
      const cells = [...rm[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) =>
        stripTags(m[1]).trim(),
      ).filter(Boolean);
      if (cells.length === 2) {
        rows.push(`<p><strong>${escapeHtml(cells[0])}</strong>: ${escapeHtml(cells[1])}</p>`);
      } else if (cells.length > 0) {
        rows.push(`<p>${cells.map(escapeHtml).join(" · ")}</p>`);
      }
    }
    return "\n" + rows.join("\n") + "\n";
  });

  // 5) <ul><li> → <p>• 항목</p> 단락. SE3 가 ul 받지 않아서.
  result = result.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner: string) => {
    const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(
      (m) => `<p>• ${stripTags(m[1]).trim()}</p>`,
    );
    return "\n" + items.join("\n") + "\n";
  });

  // 6) <ol><li> → <p>1. 항목</p> 번호 단락
  result = result.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner: string) => {
    const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(
      (m, idx) => `<p>${idx + 1}. ${stripTags(m[1]).trim()}</p>`,
    );
    return "\n" + items.join("\n") + "\n";
  });

  // 7) 허용 외 태그 stripping — 안전 whitelist
  const ALLOW = /^(?:p|a|strong|em|b|i|br|img)$/i;
  result = result.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (m, tag) => {
    if (ALLOW.test(tag)) return m;
    return "";
  });

  // 8) 빈 단락 normalize
  result = result.replace(/(\s*<p>\s*<\/p>\s*){3,}/gi, "<p>&nbsp;</p>\n<p>&nbsp;</p>");

  return result.trim();
}

function softenNaverMarketingCopy(value: string): string {
  return value
    .replace(/성장\s*지원\s*혜택을\s*놓치지\s*마세요\.?/g, "지원 조건을 확인하세요.")
    .replace(/지금\s*바로\s*자격\s*확인하고\s*신청하세요!?/g, "자격 조건과 신청 경로를 확인하세요")
    .replace(/지금\s*바로\s*신청(?:하세요|해보세요)?!?/g, "신청 조건을 확인하세요")
    .replace(/지금\s*바로\s*확인(?:하세요|해보세요)?!?/g, "신청 조건을 확인하세요")
    .replace(/\s*놓치지\s*마세요!?/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/[ \t]+$/g, "")
    .trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
