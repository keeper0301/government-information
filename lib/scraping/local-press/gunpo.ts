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
import { parseSiNttBody } from "./_si_ntt_helper";

const BASE_URL = "https://www.gunpo.go.kr";
const LIST_URL =
  "https://www.gunpo.go.kr/www/selectBbsNttList.do?bbsNo=685&key=3893";

const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=685)[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

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

// 본문 파싱은 SI selectBbsNttView 공용 헬퍼 사용 (p-table__content/bbs_content 셀).
export const parseDetailBody = parseSiNttBody;

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
