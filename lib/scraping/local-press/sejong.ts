// ============================================================
// 세종특별자치시 보도자료 수집 — G4 Phase B (helper 활용)
// ============================================================
// URL:
//   list:   /bbs/R0079/list.do
//   상세:   /bbs/R0079/view.do?nttId={alphanumeric}&mno=sub02_0401
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const LIST_URL = "https://www.sejong.go.kr/bbs/R0079/list.do";
const DETAIL_BASE =
  "https://www.sejong.go.kr/bbs/R0079/view.do?mno=sub02_0401&nttId=";

// list link + title: <a href="/bbs/R0079/view.do?nttId={alphanumeric}&...">{title}</a>
const LIST_ITEM_REGEX =
  /<a\s+href="\/bbs\/R0079\/view\.do\?nttId=([A-Za-z0-9]+)[^"]*"[^>]*>\s*([가-힣][^<]{4,}?)\s*<\/a>/g;

// 날짜: <td data-cell-header="등록일">YYYY-MM-DD</td>
const DATE_REGEX = /<td[^>]*data-cell-header="등록일"[^>]*>(\d{4}-\d{2}-\d{2})<\/td>/g;

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
      sourceUrl: `${DETAIL_BASE}${seq}`,
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

// 본문 — <div class="ui bbs--view--content"> 안 <p> 다수
const BODY_CONTAINER_REGEX =
  /<div\s+class="ui bbs--view--content"[^>]*>([\s\S]*?)<\/div>\s*<div/;

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

export const { scrapeAndInsert: scrapeSejongAndInsert } = createPressCollector({
  cityName: "세종특별자치시",
  region: "세종",
  ministry: "세종특별자치시청",
  sourceOutlet: "세종특별자치시청",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
