// ============================================================
// 전주시 보도자료 수집 — G4 Phase B (helper 활용)
// ============================================================
// URL:
//   list:   /planweb/board/list.9is?boardUid={32자리}&contentUid={32자리}
//   상세:   /planweb/board/view.9is?dataUid={32자리 hex}...
// dataUid (hex) 가 article id. 날짜는 별도 td.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BOARD_UID = "ff8080818b5bc5cf018ba8ca7216641f";
const CONTENT_UID = "ff8080818990c349018b041a87fe3960";
const LIST_URL = `https://www.jeonju.go.kr/planweb/board/list.9is?boardUid=${BOARD_UID}&contentUid=${CONTENT_UID}`;
const DETAIL_BASE = "https://www.jeonju.go.kr/planweb/board/view.9is?dataUid=";

// link + title: <a href="/planweb/board/view.9is?dataUid={32hex}...">{title}</a>
const LIST_ITEM_REGEX =
  /<a\s+href="\/planweb\/board\/view\.9is\?dataUid=([a-f0-9]{32})[^"]*"[^>]*>\s*([가-힣][^<]{4,}?)\s*<\/a>/g;

// 날짜: <td data-cell-header="작성일" class="date">YYYY-MM-DD</td>
const DATE_REGEX = /<td[^>]*class="date"[^>]*>(\d{4}-\d{2}-\d{2})<\/td>/g;

export function parseListPage(html: string): PressNewsItem[] {
  const items: Array<Omit<PressNewsItem, "publishedDate"> & { idx: number }> =
    [];
  const seen = new Set<string>();
  const dates: string[] = [];

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  let idx = 0;
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    const title = m[2].trim();
    if (!title) continue;
    seen.add(seq);
    items.push({
      idx,
      seq,
      title,
      sourceUrl: `${DETAIL_BASE}${seq}&contentUid=${CONTENT_UID}&boardUid=${BOARD_UID}`,
    });
    idx += 1;
  }

  const dateRe = new RegExp(DATE_REGEX.source, "g");
  while ((m = dateRe.exec(html)) !== null) {
    dates.push(m[1]);
  }

  return items.map((it) => ({
    seq: it.seq,
    title: it.title,
    publishedDate: dates[it.idx] ?? null,
    sourceUrl: it.sourceUrl,
  }));
}

// 본문 — <div class="view-con"> 안 <p> 다수 (hwp 변환)
const BODY_CONTAINER_REGEX =
  /<div\s+class="view-con"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/;


export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(
    m[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );
  if (!/[가-힣]/.test(text)) return null;
  if (text.length < 50) return null;
  return text.slice(0, 5000);
}

export const { scrapeAndInsert: scrapeJeonjuAndInsert } = createPressCollector({
  cityName: "전주시",
  region: "전북",
  ministry: "전주시청",
  sourceOutlet: "전주시청",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
