// ============================================================
// 충북 음성군청 보도자료 수집 (2026-07-21) — 충북권 확장
// ============================================================
// 공식 보도자료: /www/selectBbsNttList.do?bbsNo=27&key=353
// 목록: SI table p-subject selectBbsNttView.do?...bbsNo=27&nttNo={id}
// 상세: /www/selectBbsNttView.do?key=353&bbsNo=27&nttNo={id}
// 본문: SI 공용 헬퍼(p-table__content 셀)
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiNttBody } from "./_si_ntt_helper";

const BASE_URL = "https://www.eumseong.go.kr";
const LIST_URL = `${BASE_URL}/www/selectBbsNttList.do?bbsNo=27&key=353`;

const ROW_REGEX = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
const LINK_REGEX = /href="\.\/selectBbsNttView\.do\?[^"']*?bbsNo=27[^"']*?nttNo=(\d+)[^"']*?"/i;
const TITLE_REGEX = /<td[^>]*class="p-subject"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/td>/i;
const DATE_REGEX = /(\d{4})-(\d{2})-(\d{2})/;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const rowRe = new RegExp(ROW_REGEX.source, "g");
  while ((match = rowRe.exec(html)) !== null) {
    const row = match[1];
    const link = LINK_REGEX.exec(row);
    if (!link) continue;

    const seq = link[1];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const titleHtml = TITLE_REGEX.exec(row)?.[1] ?? "";
    const title = decodeBasicEntities(
      titleHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
    )
      .replace(/\s*새글\s*$/, "")
      .replace(/\s*\bNEW\s*$/, "")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = DATE_REGEX.exec(row);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?key=353&bbsNo=27&nttNo=${seq}`,
    });
  }

  return items;
}

export const parseDetailBody = parseSiNttBody;

export const { scrapeAndInsert: scrapeEumseongAndInsert } = createPressCollector({
  cityName: "충북 음성군",
  region: "충북",
  ministry: "충북 음성군청",
  sourceOutlet: "충북 음성군청",
  sourceCode: "local-press-eumseong",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
