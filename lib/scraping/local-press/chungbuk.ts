// ============================================================
// 충청북도 도청 보도자료 수집 (Phase 1 — 광역도 7번째)
// ============================================================
// 인구 160만. CMS: 충북 selectBbsNtt (key=429, bbsNo=65 board).
//   - list link: ./selectBbsNttView.do?key=429&bbsNo=65&nttNo=N
//   - 본문: detail page 표준 컨테이너
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.chungbuk.go.kr";
const LIST_URL =
  "https://www.chungbuk.go.kr/www/selectBbsNttList.do?bbsNo=65&key=429";

const LIST_ITEM_REGEX =
  /<a\s+href="\.\/selectBbsNttView\.do\?key=429[^"]*?nttNo=(\d+)[^"]*"[^>]*>([^<]+)<\/a>/g;

const DATE_REGEX = /(\d{4}-\d{2}-\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<(?:div|td)\s+(?:class|id)="(?:bbs_view|content|board_view|view_content|tbl_view)"[^>]*>([\s\S]*?)<\/(?:div|td)>/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: Array<Omit<PressNewsItem, "publishedDate"> & { idx: number }> = [];
  const seen = new Set<string>();
  const dates: string[] = [];

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  let idx = 0;
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(m[2]).trim();
    if (!title || title.length < 5) continue;
    items.push({
      idx,
      seq,
      title,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?key=429&bbsNo=65&nttNo=${seq}`,
    });
    idx += 1;
  }

  const dateRe = new RegExp(DATE_REGEX.source, "g");
  while ((m = dateRe.exec(html)) !== null) {
    dates.push(m[1]);
  }

  return items.map((item) => ({
    seq: item.seq,
    title: item.title,
    publishedDate: dates[item.idx] ?? null,
    sourceUrl: item.sourceUrl,
  }));
}

export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(m[1])
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length >= 50 ? text : null;
}

export const { scrapeAndInsert: scrapeChungbukAndInsert } = createPressCollector({
  cityName: "충청북도",
  region: "충북",
  ministry: "충청북도청",
  sourceOutlet: "충청북도청",
  sourceCode: "local-press-chungbuk",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
