// ============================================================
// 강원 동해시청 보도/해명자료 수집 (2026-07-20) — 강원권 확장
// ============================================================
// 공식 보도/해명자료: /www/selectBbsNttList.do?bbsNo=95&key=489
// 목록: selectBbsNttView.do(;JSESSION)?...bbsNo=95&nttNo={id}
// 상세: /www/selectBbsNttView.do?key=489&bbsNo=95&nttNo={id}
// 본문: SI 공용 헬퍼(p-table__content 셀)
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiNttBody } from "./_si_ntt_helper";

const BASE_URL = "https://www.dh.go.kr";
const LIST_URL = `${BASE_URL}/www/selectBbsNttList.do?bbsNo=95&key=489`;

const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do(?:;[^?"]*)?\?(?=[^"]*bbsNo=95(?:&|&amp;|"))[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,1200}?)<\/a>/g;
const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((match = itemRe.exec(html)) !== null) {
    const seq = match[1];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = decodeBasicEntities(
      match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
    )
      .replace(/\s*새글\s*$/, "")
      .replace(/\s*\bNEW\s*$/, "")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const slice = html.slice(match.index, match.index + 2400);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;

    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?key=489&bbsNo=95&nttNo=${seq}`,
    });
  }

  return items;
}

export const parseDetailBody = parseSiNttBody;

export const { scrapeAndInsert: scrapeDonghaeAndInsert } =
  createPressCollector({
    cityName: "강원 동해시",
    region: "강원",
    ministry: "강원 동해시청",
    sourceOutlet: "강원 동해시청",
    sourceCode: "local-press-donghae",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
