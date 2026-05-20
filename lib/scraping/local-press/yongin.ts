// ============================================================
// 용인특례시 보도자료 수집 — G4 Phase B (helper 활용)
// ============================================================
// URL:
//   list:   /user/bbs/BD_selectBbsList.do?q_bbsCode=1020
//   상세:   /user/bbs/BD_selectBbs.do?q_bbsCode=1020&q_bbscttSn={17자리 seq}
// onclick: opView('{17자리 seq}') 패턴 — seq 앞 8자리 = YYYYMMDD (날짜)
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const LIST_URL =
  "https://www.yongin.go.kr/user/bbs/BD_selectBbsList.do?q_bbsCode=1020";
const DETAIL_BASE =
  "https://www.yongin.go.kr/user/bbs/BD_selectBbs.do?q_bbsCode=1020&q_bbscttSn=";

// list link + title: <a href="BD_selectBbs.do?...q_bbscttSn={seq}">{한국어 title}</a>
// 두 번째 link (heading dl dt btitle) 안에 진짜 제목 (첫 link 는 thumbnail).
// 한국어 시작 + 5자+ 만 매칭 (image alt 와 충돌 방지).
const LIST_ITEM_REGEX =
  /<a\s+href="BD_selectBbs\.do\?q_bbsCode=1020&(?:amp;)?q_bbscttSn=(\d{14,})"[^>]*>([가-힣][^<]{4,})<\/a>/g;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    const title = m[2].trim();
    if (!title) continue;
    seen.add(seq);
    // seq 앞 8자리 = YYYYMMDD → YYYY-MM-DD
    const publishedDate =
      seq.length >= 8
        ? `${seq.slice(0, 4)}-${seq.slice(4, 6)}-${seq.slice(6, 8)}`
        : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${DETAIL_BASE}${seq}`,
    });
  }
  return items;
}

// 상세 본문 — 고양과 유사한 article-detail container 추정. probe 결과 정확 selector 확보.
// 시도 1: <div id="webView" class="article-detail">
// 시도 2: <div class="boardContent"> 또는 <div class="bbsViewBody">
// 시도 3: <td class="bbsViewTd"> (table 기반)
const BODY_REGEXES: RegExp[] = [
  /<div\s+id="webView"\s+class="article-detail"[^>]*>([\s\S]*?)<\/div>\s*<div\s+id="mobileView"/,
  /<div\s+id="mobileView"\s+class="article-detail"[^>]*>([\s\S]*?)<\/div>\s*<div/,
  /<div\s+class="board[_-]?view[_-]?content[^"]*"[^>]*>([\s\S]*?)<\/div>/,
  /<div\s+class="bbsViewBody[^"]*"[^>]*>([\s\S]*?)<\/div>/,
];


export function parseDetailBody(html: string): string | null {
  for (const re of BODY_REGEXES) {
    const m = re.exec(html);
    if (!m) continue;
    const text = decodeBasicEntities(
      m[1]
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]+/g, " ")
        .trim(),
    );
    if (/[가-힣]/.test(text) && text.length >= 50) {
      return text.slice(0, 5000);
    }
  }

  // Fallback — 용인은 본문이 <p>한국어...</p> 다수 (table 안). 일반 paragraph 파서.
  const PARAGRAPH_REGEX = /<p[^>]*>([^<]{20,})<\/p>/g;
  const paragraphs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = PARAGRAPH_REGEX.exec(html)) !== null) {
    const text = decodeBasicEntities(m[1].trim());
    if (!/[가-힣]/.test(text)) continue;
    if (/element-invisible|첨부파일|문서보기|jsView|fileDownload/.test(text)) continue;
    paragraphs.push(text);
  }
  if (paragraphs.length === 0) return null;
  const joined = paragraphs.join("\n");
  if (joined.length < 50) return null;
  return joined.slice(0, 5000);
}

export const { scrapeAndInsert: scrapeYonginAndInsert } = createPressCollector({
  cityName: "용인특례시",
  region: "경기",
  ministry: "용인특례시청",
  sourceOutlet: "용인특례시청",

  sourceCode: "local-press-yongin",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
