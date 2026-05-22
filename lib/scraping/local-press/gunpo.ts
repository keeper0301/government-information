// ============================================================
// 군포시청 보도자료 수집 (2026-05-22)
// ============================================================
// 군포시 인구 26만. SI 표준 selectBbsNttList. 12,277+ 보도자료.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gunpo.go.kr";
const LIST_URL =
  "https://www.gunpo.go.kr/www/selectBbsNttList.do?bbsNo=685&key=3893";

const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=685)[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:bbs_wrap|p-table__content|bbs__view)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:p-table__bottom|btn|pagination)|<\/article|<\/section)/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(
      m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " "),
    ).replace(/새글$/, "").trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const slice = html.slice(m.index, m.index + 800);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?bbsNo=685&nttNo=${seq}&key=3893`,
    });
  }
  return items;
}

export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(m[1])
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[가-힣]/.test(text) || text.length < 50) return null;
  return text.slice(0, 5000);
}

export const { scrapeAndInsert: scrapeGunpoAndInsert } = createPressCollector({
  cityName: "군포시",
  region: "경기",
  ministry: "군포시청",
  sourceOutlet: "군포시청",
  sourceCode: "local-press-gunpo",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
