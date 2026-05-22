// ============================================================
// 노원구청 보도자료 수집 (2026-05-22) — 광역시 자치구 확장
// ============================================================
// 노원구 인구 51만. 화성·수원 와 동일 SI 표준 CMS (BD_select 패턴, 5,563+).
//
// URL:
//   list:   /www/user/bbs/BD_selectBbsList.do?q_bbsCode=1027
//   상세:   /www/user/bbs/BD_selectBbs.do?q_bbsCode=1027&q_bbscttSn={17자리}
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const LIST_URL =
  "https://www.nowon.kr/www/user/bbs/BD_selectBbsList.do?q_bbsCode=1027";
const DETAIL_BASE =
  "https://www.nowon.kr/www/user/bbs/BD_selectBbs.do?q_bbsCode=1027&q_bbscttSn=";

// 화성 패턴 동일 — 새 site nested tag 대응 loose
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*BD_selectBbs\.do\?q_bbsCode=1027&(?:amp;)?q_bbscttSn=(\d{14,})[^"]*"[^>]*>([\s\S]{0,300}?)<\/a>/g;

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
    ).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    // seq 앞 8자리 = YYYYMMDD
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

// 본문 — 화성·수원 SI 표준 board_text_td 또는 hwp_editor_board_content
const BODY_REGEXES: RegExp[] = [
  /<td[^>]*class="board_text_td"[^>]*>([\s\S]*?)<\/td>/,
  /<div\s+class="hwp_editor_board_content"[^>]*>([\s\S]*?)<\/div>\s*<\/td>/,
  /<div\s+class="board[_-]?view[_-]?content[^"]*"[^>]*>([\s\S]*?)<\/div>/,
];

export function parseDetailBody(html: string): string | null {
  for (const re of BODY_REGEXES) {
    const m = re.exec(html);
    if (!m) continue;
    const text = decodeBasicEntities(
      m[1]
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    );
    if (/[가-힣]/.test(text) && text.length >= 50) {
      return text.slice(0, 5000);
    }
  }
  return null;
}

export const { scrapeAndInsert: scrapeNowonAndInsert } = createPressCollector({
  cityName: "노원구",
  region: "서울",
  ministry: "노원구청",
  sourceOutlet: "노원구청",
  sourceCode: "local-press-nowon",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
