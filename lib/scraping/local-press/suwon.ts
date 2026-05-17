// ============================================================
// 수원특례시청 보도자료 수집 — G4 Phase B (helper 활용 첫 사례)
// ============================================================
// CMS: jsView('1043', '{17자리 seq}', 'Y', 'Y') onclick 패턴.
// 상세 URL 추정: /web/board/BD_board.view.do?bbsCd=1043&seq={seq}
// ============================================================

import {
  createPressCollector,
  type PressNewsItem,
} from "./_factory";

const LIST_URL =
  "https://www.suwon.go.kr/web/board/BD_board.list.do?bbsCd=1043";
const DETAIL_BASE =
  "https://www.suwon.go.kr/web/board/BD_board.view.do?bbsCd=1043&seq=";

// 목록 row: <a onclick="jsView('1043', '{seq}', 'Y', 'Y')">{title}</a>
const LIST_ITEM_REGEX =
  /onclick="jsView\(\s*'1043'\s*,\s*'(\d{17})'\s*,[^)]*\)[^>]*>\s*([^<]+?)\s*</g;

// 날짜 별도 td — YYYY/MM/DD 형식 (서울 YYYY-MM-DD 와 다름)
const DATE_REGEX = /(\d{4})\/(\d{2})\/(\d{2})/g;

export function parseListPage(html: string): PressNewsItem[] {
  const items: Array<Omit<PressNewsItem, "publishedDate"> & { idx: number }> =
    [];
  const dates: string[] = [];

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  let idx = 0;
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    const title = m[2].trim().replace(/\s*새글\s*$/, "");
    if (!seq || !title) continue;
    items.push({
      idx,
      seq,
      title,
      sourceUrl: `${DETAIL_BASE}${seq}`,
    });
    idx += 1;
  }

  // 날짜 매핑 — 같은 row 순서
  const dateRe = new RegExp(DATE_REGEX.source, "g");
  while ((m = dateRe.exec(html)) !== null) {
    dates.push(`${m[1]}-${m[2]}-${m[3]}`);
  }

  return items.map((it) => ({
    seq: it.seq,
    title: it.title,
    publishedDate: dates[it.idx] ?? null,
    sourceUrl: it.sourceUrl,
  }));
}

// 상세 page 본문 — 한국어 <p> 추출 (서울 패턴 재사용)
export function parseDetailBody(html: string): string | null {
  const PARAGRAPH_REGEX = /<p[^>]*>([^<]{20,})<\/p>/g;
  const paragraphs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = PARAGRAPH_REGEX.exec(html)) !== null) {
    const text = m[1]
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();
    if (!/[가-힣]/.test(text)) continue;
    if (/element-invisible|첨부파일|문서보기|jsView/.test(text)) continue;
    paragraphs.push(text);
  }
  if (paragraphs.length === 0) return null;
  return paragraphs.join("\n").slice(0, 5000);
}

export const { scrapeAndInsert: scrapeSuwonAndInsert } = createPressCollector({
  cityName: "수원시",
  region: "경기",
  ministry: "수원특례시청",
  sourceOutlet: "수원특례시청",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
