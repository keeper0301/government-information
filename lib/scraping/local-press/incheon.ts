// ============================================================
// 인천광역시청 보도자료 수집 — G4 Phase B (helper 활용)
// ============================================================
// URL:
//   list:   https://www.incheon.go.kr/IC010205
//   상세:   /IC010205/view?repSeq=DOM_{16자리}&curPage=1
//
// 본문은 <p> 가 아닌 <div class="board-view-contents"> 안의 텍스트 + <br />.
// 따라서 parseDetailBody 는 다른 시·군 (<p> 기반) 과 별도 패턴.
// ============================================================

import {
  createPressCollector,
  type PressNewsItem,
} from "./_factory";

const LIST_URL = "https://www.incheon.go.kr/IC010205";
const DETAIL_BASE = "https://www.incheon.go.kr";

// list link + title: <a href="/IC010205/view?repSeq=DOM_...">...<strong class="subject">{title}</strong>
const LIST_ITEM_REGEX =
  /<a\s+href="\/IC010205\/view\?repSeq=(DOM_\d+)[^"]*"[^>]*>[\s\S]*?<strong\s+class="subject">([^<]+)<\/strong>/g;

// 날짜: <dt>제공일자</dt><dd>YYYY-MM-DD</dd>
const DATE_REGEX = /<dt>제공일자<\/dt>\s*<dd>(\d{4}-\d{2}-\d{2})<\/dd>/g;

export function parseListPage(html: string): PressNewsItem[] {
  const items: Array<Omit<PressNewsItem, "publishedDate"> & { idx: number }> =
    [];
  const dates: string[] = [];

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  let idx = 0;
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    const title = m[2].trim();
    if (!seq || !title) continue;
    items.push({
      idx,
      seq,
      title,
      sourceUrl: `${DETAIL_BASE}/IC010205/view?repSeq=${seq}&curPage=1`,
    });
    idx += 1;
  }

  const dateRe = new RegExp(DATE_REGEX.source, "g");
  while ((m = dateRe.exec(html)) !== null) {
    dates.push(m[1]);
  }

  return items.map((it) => ({
    seq: it.seq,
    title: it.title,
    publishedDate: dates[it.idx] ?? null,
    sourceUrl: it.sourceUrl,
  }));
}

// 상세 본문 — <div class="board-view-contents cms_content">...</div> 안.
// 다른 시·군과 달리 <p> 가 아니라 <br /> 로 줄바꿈된 일반 텍스트.
const BODY_CONTAINER_REGEX =
  /<div\s+class="board-view-contents[^"]*"[^>]*>([\s\S]*?)<\/div>/;

export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  const text = m[1]
    .replace(/<!--[\s\S]*?-->/g, "") // 주석 제거
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  // 한국어 1자 이상 검증
  if (!/[가-힣]/.test(text)) return null;
  if (text.length < 50) return null;
  return text.slice(0, 5000);
}

export const { scrapeAndInsert: scrapeIncheonAndInsert } = createPressCollector({
  cityName: "인천광역시",
  region: "인천",
  ministry: "인천광역시청",
  sourceOutlet: "인천광역시청",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
