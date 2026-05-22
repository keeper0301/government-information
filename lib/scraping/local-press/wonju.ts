// ============================================================
// 원주시청 보도자료 수집 (2026-05-22)
// ============================================================
// 원주시 인구 35만. SI 표준 + 40,744+ 보도자료 (매우 풍부).
// 강원도청과 비슷한 wonju.go.kr.
//
// URL:
//   list:   wonju.go.kr/www/selectBbsNttList.do?bbsNo=145&key=222
//   상세:   /www/selectBbsNttView.do?bbsNo=145&nttNo=N&key=222
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.wonju.go.kr";
const LIST_URL =
  "https://www.wonju.go.kr/www/selectBbsNttList.do?bbsNo=145&key=222";

const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=145)[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

// 원주 body — bbs_wrap 안 본문 (송파 bbs__view 와 다른 표준)
const BODY_CONTAINER_REGEX =
  /<div\s+class="bbs_wrap"[^>]*>([\s\S]{500,40000}?)<\/div>\s*<\/div>/i;

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
    )
      .replace(/NEW$/, "")
      .trim();
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
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?bbsNo=145&nttNo=${seq}&key=222`,
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

export const { scrapeAndInsert: scrapeWonjuAndInsert } = createPressCollector({
  cityName: "원주시",
  region: "강원",
  ministry: "원주시청",
  sourceOutlet: "원주시청",
  sourceCode: "local-press-wonju",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
