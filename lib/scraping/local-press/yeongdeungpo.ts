// ============================================================
// 영등포구청 보도자료 수집 (2026-06-01) — 서울 자치구 확장
// ============================================================
// 인구 38만. SI 표준 selectBbsNttList (송파·군포 동일 CMS).
// 도메인 www.ydp.go.kr, path /www/. bbsNo=45, key=2868.
//
// URL:
//   list:   /www/selectBbsNttList.do?bbsNo=45&key=2868
//   상세:   /www/selectBbsNttView.do?bbsNo=45&nttNo=N&key=2868
// 본문: SI 공용 헬퍼(p-table__content/bbs_content 셀).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiNttBody } from "./_si_ntt_helper";

const BASE_URL = "https://www.ydp.go.kr";
const LIST_URL = `${BASE_URL}/www/selectBbsNttList.do?bbsNo=45&key=2868`;

const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=45)[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,500}?)<\/a>/g;

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
    )
      .replace(/\s*\bNEW\s*$/, "") // 새 글 배지 strip (\b 로 RENEW 보호, \s* 로 배지 뒤 공백 허용)
      .replace(/새글$/, "")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const slice = html.slice(m.index, m.index + 800);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch ? dateMatch[1].replace(/\./g, "-") : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?bbsNo=45&nttNo=${seq}&key=2868`,
    });
  }
  return items;
}

export const parseDetailBody = parseSiNttBody;

export const { scrapeAndInsert: scrapeYeongdeungpoAndInsert } =
  createPressCollector({
    cityName: "영등포구",
    region: "서울",
    ministry: "영등포구청",
    sourceOutlet: "영등포구청",
    sourceCode: "local-press-yeongdeungpo",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
