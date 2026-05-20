// ============================================================
// 익산시 보도자료 수집 — G4 Phase B (helper 활용, planweb 9is CMS)
// ============================================================
// URL:
//   list:   /index.9is?menuUid=ff80808198eafcbd019902ab48032c02 (보도자료 메뉴)
//   상세:   /board/post/view.do?boardUid=...&menuUid=...&postUid={alphanumeric}
// list 는 9is 확장자 (planweb CMS), detail 은 .do 표준. table 기반 (data-cell-header).
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const LIST_URL =
  "http://www.iksan.go.kr/index.9is?menuUid=ff80808198eafcbd019902ab48032c02";
const DETAIL_BASE_ORIGIN = "http://www.iksan.go.kr";

// list anchor: <a href="/board/post/view.do?...postUid={alphanumeric}" title="{title}">
const LIST_ITEM_REGEX =
  /<a\s+href="(\/board\/post\/view\.do\?[^"]*postUid=([a-z0-9]+)[^"]*)"\s+title="([^"]+)"/g;

// 작성일: <td data-cell-header="작성일" class="date">\s*<strong ...>...</strong>\s*YYYY-MM-DD</td>
const DATE_REGEX =
  /<td\s+data-cell-header="작성일"\s+class="date">[\s\S]*?(\d{4})-(\d{2})-(\d{2})\s*<\/td>/g;

export function parseListPage(html: string): PressNewsItem[] {
  const items: Array<Omit<PressNewsItem, "publishedDate"> & { idx: number }> =
    [];
  const seen = new Set<string>();
  const dates: string[] = [];

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  let idx = 0;
  while ((m = itemRe.exec(html)) !== null) {
    const href = m[1];
    const seq = m[2];
    const title = decodeBasicEntities(m[3]).trim();
    if (!title) continue;
    if (seen.has(seq)) continue;
    seen.add(seq);
    items.push({
      idx,
      seq,
      title,
      sourceUrl: `${DETAIL_BASE_ORIGIN}${href.replace(/&amp;/g, "&")}`,
    });
    idx += 1;
  }

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

// 본문 — hwp_editor_board_content 우선 + view_con fallback
const BODY_REGEXES: RegExp[] = [
  /<div\s+class="hwp_editor_board_content"[^>]*>([\s\S]*?)<\/div>\s*<\/td>/,
  /<div\s+class="view_con"[^>]*>([\s\S]*?)<\/div>\s*<\/td>/,
];

export function parseDetailBody(html: string): string | null {
  for (const re of BODY_REGEXES) {
    const m = re.exec(html);
    if (!m) continue;
    const text = decodeBasicEntities(
      m[1]
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]+/g, " ")
        .trim(),
    );
    if (/[가-힣]/.test(text) && text.length >= 50) {
      return text.slice(0, 5000);
    }
  }
  return null;
}

export const { scrapeAndInsert: scrapeIksanAndInsert } = createPressCollector({
  cityName: "익산시",
  region: "전북",
  ministry: "익산시청",
  sourceOutlet: "익산시청",

  sourceCode: "local-press-iksan",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
