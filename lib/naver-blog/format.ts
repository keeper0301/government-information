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

// 관철이 지정한 참고글(leclerc23/224311229716) 스타일 기준:
// - H1 은 네이버 제목 필드에 맡기고 본문에는 반복하지 않는다
// - 첫 화면은 짧은 문단 2개 → 가운데 빨간 CTA → 👇👇 → keepioo 외부링크 → 상세 섹션 흐름
// - 본문은 좌측 정렬, 16px 전후, 짧은 문단, 넓은 행간
// - H2 는 참고글의 blockquote 질문 제목처럼 굵은 인용박스형 제목으로 보이게 구성
// - H3 는 세부 조건 제목으로, 작은 글자·얇은 좌측바·짧은 여백으로 H2보다 가볍게 구성
// - 핵심 CTA는 가운데 정렬 + 빨간색 + 굵게 + 밑줄
// - 표는 파란 헤더/얇은 테두리로 네이버 본문 안에서 바로 보이게 구성
const NAVER_PARAGRAPH_STYLE = "font-size:16px;line-height:2.05;color:#222;text-align:left;margin:0 0 22px;";
const NAVER_H2_TITLE_STYLE = "border-left:6px solid #d8d8d8;background:#fafafa;padding:16px 0 16px 20px;margin:52px 0 24px;font-size:24px;line-height:1.48;font-weight:800;color:#111;text-align:left;";
const NAVER_H3_TITLE_STYLE = "border-left:4px solid #9a9a9a;padding-left:14px;margin:34px 0 16px;font-size:19px;line-height:1.55;font-weight:700;color:#222;text-align:left;";
const NAVER_CENTER_CTA_STYLE = "font-size:20px;line-height:1.7;font-weight:800;color:#ff2b00;text-align:center;text-decoration:underline;margin:30px 0 8px;";
const NAVER_DIVIDER_STYLE = "text-align:center;font-weight:700;color:#888;margin:34px 0 30px;letter-spacing:1px;";
const NAVER_TABLE_STYLE = "width:100%;border-collapse:collapse;margin:30px 0 36px;font-size:15px;text-align:center;";
const NAVER_TABLE_HEAD_STYLE = "background:#3f70bd;color:#fff;border:1px solid #2f5597;padding:10px 8px;font-weight:700;";
const NAVER_TABLE_CELL_STYLE = "border:1px solid #777;padding:10px 8px;color:#111;background:#fff;";

function naverParagraphHtml(text: string): string {
  return `<p style="${NAVER_PARAGRAPH_STYLE}">${escapeHtml(text)}</p>`;
}

function naverBlankHtml(): string {
  return `<p>&nbsp;</p>`;
}

function naverSectionTitleHtml(title: string, level: "h2" | "h3" = "h2"): string {
  const style = level === "h3" ? NAVER_H3_TITLE_STYLE : NAVER_H2_TITLE_STYLE;
  return `<p style="${style}">${escapeHtml(title)}</p>`;
}

function naverCenteredCtaHtml(label: string, href: string): string {
  return `<p style="${NAVER_CENTER_CTA_STYLE}"><a href="${escapeAttr(href)}">${escapeHtml(label)}</a></p>`;
}

function naverCenteredExternalLinkHtml(href: string): string {
  return `<p style="font-size:16px;line-height:1.8;text-align:center;margin:0 0 34px;color:#0068c9;"><a href="${escapeAttr(href)}">${escapeHtml(href)}</a></p>`;
}

function naverStyledTableHtml(rows: string[][]): string {
  if (rows.length === 0) return "";
  const normalizedRows = rows.length >= 2 && rows.every((row) => row.length === 2)
    ? [rows.map((row) => row[0]), rows.map((row) => row[1])]
    : rows;
  const head = normalizedRows[0]
    .map((cell) => `<th style="${NAVER_TABLE_HEAD_STYLE}">${escapeHtml(cell)}</th>`)
    .join("");
  const body = normalizedRows.slice(1)
    .map((row) => `<tr>${row.map((cell) => `<td style="${NAVER_TABLE_CELL_STYLE}">${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("\n");
  return `<table style="${NAVER_TABLE_STYLE}">\n<tr>${head}</tr>\n${body}\n</table>`;
}

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
  const checklistItems = buildNaverChecklistText(contentForNaver);
  const compactChecklist = [
    "신청 전 핵심 확인",
    ...checklistItems.slice(0, 5).map((item) => `• ${item}`),
    "",
  ].join("\n");

  // 2) 본문 변환
  const bodyText = softenNaverMarketingCopy(htmlToNaverText(contentForNaver));

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

  const body = (intro + compactChecklist + bodyText + footer).trim();

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
    for (const rowMatch of inner.matchAll(rowRe)) {
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

function extractNaverPlainLines(html: string): string[] {
  return decodeBasicEntities(stripTags(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n"),
  ))
    .replace(/\u00a0/g, " ")
    .split(/\n|(?<=[.!?。])\s+/)
    .map((line) => softenNaverMarketingCopy(line.replace(/\s+/g, " ").trim()))
    .filter(Boolean);
}

function findNaverFactLine(
  lines: string[],
  re: RegExp,
  fallback: string,
  preferred?: RegExp,
): string {
  const candidates = preferred
    ? [...lines.filter((line) => preferred.test(line)), ...lines.filter((line) => !preferred.test(line))]
    : lines;
  for (let i = 0; i < candidates.length; i += 1) {
    const line = candidates[i];
    if (!re.test(line)) continue;
    if (line.length >= 8 && !/^신청\s*대상$|^지원\s*금액$|^신청\s*자격$|^제출\s*서류$|^문의처?$/.test(line)) {
      return shortenNaverFact(line);
    }
    const originalIndex = lines.indexOf(line);
    const next = lines[originalIndex + 1];
    if (next && next.length >= 4) return shortenNaverFact(next);
  }
  return shortenNaverFact(fallback);
}

function shortenNaverFact(value: string): string {
  const cleaned = value
    .replace(/^(지원\s*대상|대상|지원\s*금액|지원\s*내용|혜택|신청\s*기간|기간|문의처?|경로)\s*[:：]?\s*/i, "")
    .replace(/^(제출\s*서류|서류)\s*[:：]\s*/i, "")
    .trim();
  return cleaned.length > 58 ? `${cleaned.slice(0, 58).trim()}…` : cleaned;
}

function buildNaverChecklistText(html: string): string[] {
  const lines = extractNaverPlainLines(html);
  const routeLines = lines.filter((line) => !/마감|기간|상반기|하반기|예산\s*소진|놓치지|습관|중요한\s*기회/.test(line));
  return [
    `대상: ${findNaverFactLine(lines, /대상|자격|조건|나이|연령|지역|거주|소득|사업자/, "공식 공고의 대상 조건 확인", /^지원\s*대상|^대상[:：]/)}`,
    `혜택: ${findNaverFactLine(lines, /지원\s*(금액|내용)|혜택|최대|월\s*\d|분기|만원|원\b/, "금액과 지급 방식 확인", /^지원\s*금액|^지원\s*내용|^혜택[:：]/)}`,
    `기간: ${findNaverFactLine(lines, /기간|마감|공고|예산\s*소진|선착순|\d{4}[.\-년]/, "신청 마감일과 예산 소진 여부 확인", /^신청\s*기간|^기간[:：]/)}`,
    `서류: ${findNaverFactLine(lines, /서류|제출|준비물|증빙|주민등록|소득\s*증명|사업자등록/, "증빙 필요 여부 확인", /^제출\s*서류|^서류[:：]/)}`,
    `경로: ${findNaverFactLine(routeLines, /홈페이지|누리집|온라인|방문|문의|기관|센터|담당|페이지/, "공식 신청 페이지 또는 담당 기관 확인")}`,
  ];
}

function buildNaverKeySummaryText(html: string): string[] {
  const plain = extractNaverPlainLines(html);

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

function stripChecklistLabel(item: string): string {
  return item.replace(/^[^:：]+[:：]\s*/, "").trim();
}

function buildNaverAeoFaqHtml(checklistItems: string[]): string {
  const target = stripChecklistLabel(checklistItems[0] ?? "공식 공고의 대상 조건 확인");
  const benefit = stripChecklistLabel(checklistItems[1] ?? "금액과 지급 방식 확인");
  const period = stripChecklistLabel(checklistItems[2] ?? "신청 마감일과 예산 소진 여부 확인");
  const route = stripChecklistLabel(checklistItems[4] ?? "공식 신청 페이지 또는 담당 기관 확인");
  return [
    `<p>&nbsp;</p>`,
    naverSectionTitleHtml("자주 묻는 질문"),
    `<p><strong>Q. 누가 신청할 수 있나요?</strong></p>`,
    `<p>A. ${escapeHtml(target)}</p>`,
    `<p><strong>Q. 얼마나 지원받을 수 있나요?</strong></p>`,
    `<p>A. ${escapeHtml(benefit)}</p>`,
    `<p><strong>Q. 언제까지 확인해야 하나요?</strong></p>`,
    `<p>A. ${escapeHtml(period)}</p>`,
    `<p><strong>Q. 어디에서 신청하나요?</strong></p>`,
    `<p>A. ${escapeHtml(route)}</p>`,
  ].join("\n");
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

  // 1) 도입부 — 참고 네이버 글처럼 네이버 제목(H1) 아래 짧은 본문 2문단 → 가운데 빨간 CTA → 👇👇 → keepioo 외부링크 → 상세 섹션 순서.
  //    기존 "요약 답변/검색 핵심 정보" 반복 제목은 자동 생성 티가 강해 제거한다.
  const checklistItems = buildNaverChecklistText(contentForNaver);
  const answerSummary = post.meta_description
    ? softenNaverMarketingCopy(post.meta_description.trim())
    : buildNaverKeySummaryText(contentForNaver)[0] ?? post.title;
  const target = stripChecklistLabel(checklistItems[0] ?? "공식 공고의 대상 조건 확인");
  const benefit = stripChecklistLabel(checklistItems[1] ?? "금액과 지급 방식 확인");
  const period = stripChecklistLabel(checklistItems[2] ?? "신청 마감일과 예산 소진 여부 확인");
  const hookHtml = [
    naverParagraphHtml(answerSummary),
    naverParagraphHtml(`${target}에 해당한다면 지원 내용(${benefit})과 기간(${period})을 먼저 확인해두는 게 좋아요. 공고마다 세부 조건이 달라질 수 있으니 아래 핵심 정리를 참고하세요.`),
    naverCenteredCtaHtml("자격·신청 조건 바로가기", backlinkUrl),
    `<p style="text-align:center;color:#ff2b00;font-size:18px;line-height:1.4;margin:0 0 10px;">👇👇</p>`,
    naverCenteredExternalLinkHtml(backlinkUrl),
    naverBlankHtml(),
  ].join("\n");
  const faqHtml = buildNaverAeoFaqHtml(checklistItems);

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
    naverBlankHtml(),
    `<p style="${NAVER_DIVIDER_STYLE}">━━━━━━━━━━━━━━━━━━</p>`,
    naverParagraphHtml("공식 조건은 모집 시점·지역·예산에 따라 달라질 수 있어요."),
    naverParagraphHtml("신청 전에는 반드시 해당 기관의 최신 공고를 한 번 더 확인하세요."),
    naverBlankHtml(),
    naverCenteredCtaHtml("자세한 자격·금액·신청 방법 정리", backlinkUrl),
    naverParagraphHtml(backlinkUrl),
    naverBlankHtml(),
    naverParagraphHtml("내 조건에 맞는 정책을 더 찾고 싶다면"),
    naverParagraphHtml(`${BASE_URL}/recommend`),
    `<p style="${NAVER_DIVIDER_STYLE}">━━━━━━━━━━━━━━━━━━</p>`,
  ].join("\n");

  const bodyHtml = (
    coverHtml +
    hookHtml +
    bodyContentHtml +
    "\n" +
    faqHtml +
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

  // 3) <h2>·<h3>·<h4> → 제목 단락 + 빈 줄.
  //    H2/H3 의 글자 크기·여백·좌측 바 두께를 분리해 글 계층을 명확히 보존한다.
  for (const lvl of ["h2", "h3", "h4"] as const) {
    const re = new RegExp(`<${lvl}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${lvl}>`, "gi");
    result = result.replace(re, (_, inner: string) => {
      const cleaned = stripTags(inner).trim();
      const level = lvl === "h3" ? "h3" : "h2";
      return `<p>&nbsp;</p>\n${naverSectionTitleHtml(cleaned, level)}\n`;
    });
  }

  // 4) <table> → 참고글처럼 파란 헤더가 있는 실제 HTML table로 변환.
  result = result.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, inner: string) => {
    const rows: string[][] = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    for (const rm of inner.matchAll(rowRe)) {
      const cells = [...rm[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) =>
        stripTags(m[1]).trim(),
      ).filter(Boolean);
      if (cells.length > 0) rows.push(cells);
    }
    return rows.length > 0 ? `\n${naverStyledTableHtml(rows)}\n` : "";
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
  const ALLOW = /^(?:p|a|strong|em|b|i|br|img|table|tr|th|td)$/i;
  result = result.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (m, tag) => {
    if (ALLOW.test(tag)) return m;
    return "";
  });

  // 8) 참고글처럼 일반 본문 문단은 좌측 정렬·16px·넓은 행간으로 통일.
  //    이미 스타일이 있는 CTA/소제목/표 문단과 빈 줄은 건드리지 않는다.
  result = result.replace(/<p>(?!\s*&nbsp;)([\s\S]*?)<\/p>/gi, `<p style="${NAVER_PARAGRAPH_STYLE}">$1</p>`);

  // 9) 빈 단락 normalize
  result = result.replace(/(\s*<p>\s*<\/p>\s*){3,}/gi, "<p>&nbsp;</p>\n<p>&nbsp;</p>");

  result = softenNaverMarketingCopy(result);

  return result.trim();
}

function softenNaverMarketingCopy(value: string): string {
  return value
    .replace(/성장\s*지원\s*혜택을\s*놓치지\s*마세요\.?/g, "지원 조건을 확인하세요.")
    .replace(/지금\s*바로\s*자격\s*확인하고\s*신청하세요!?/g, "자격 조건과 신청 경로를 확인하세요")
    .replace(/지금\s*바로\s*자격을\s*확인하세요!?/g, "자격 조건을 확인하세요")
    .replace(/지금\s*바로\s*신청(?:하세요|해보세요)?!?/g, "신청 조건을 확인하세요")
    .replace(/지금\s*바로\s*확인(?:하세요|해보세요)?!?/g, "신청 조건을 확인하세요")
    .replace(/자격\s*조건을\s*확인하세요\.\s*지원\s*조건을\s*확인하세요\.?/g, "자격 조건과 신청 경로를 확인하세요.")
    .replace(/신청\s*조건을\s*확인하세요\s*\(정확한 일정은 공식 공고 확인\)/g, "정확한 일정은 공식 공고에서 확인")
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
