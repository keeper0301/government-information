// ============================================================
// 구로구청 보도자료 수집 (2026-06-01) — 서울 자치구 확장
// ============================================================
// 인구 39만. SI 표준 selectBbsNttList (송파·군포 동일 CMS). path /www/.
// 메인(www.guro.go.kr/)은 빈 shell → 실제 콘텐츠는 /www/index.do. 보도자료 bbsNo=665.
//
// URL:
//   list:   /www/selectBbsNttList.do?bbsNo=665&key=1793
//   상세:   /www/selectBbsNttView.do?bbsNo=665&nttNo=N&key=1793
// 본문: SI 공용 헬퍼(p-table__content/bbs_content 셀).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiNttBody } from "./_si_ntt_helper";

const BASE_URL = "https://www.guro.go.kr";
const LIST_URL = `${BASE_URL}/www/selectBbsNttList.do?bbsNo=665&key=1793`;

// title 캡처 {0,900} (href param 체인 대비) + lookahead 종결자 bbsNo=665(?:&|").
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=665(?:&|"))[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,900}?)<\/a>/g;

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
      .replace(/\s*새글\s*$/, "")
      .replace(/\s*\bNEW\s*$/, "")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const slice = html.slice(m.index, m.index + 1000);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?bbsNo=665&nttNo=${seq}&key=1793`,
    });
  }
  return items;
}

export const parseDetailBody = parseSiNttBody;

export const { scrapeAndInsert: scrapeGuroAndInsert } = createPressCollector({
  cityName: "구로구",
  region: "서울",
  ministry: "구로구청",
  sourceOutlet: "구로구청",
  sourceCode: "local-press-guro",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
