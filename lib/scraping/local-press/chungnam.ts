// ============================================================
// 충청남도 도청 보도자료 수집 (Phase 1 — 광역도 6번째)
// ============================================================
// 인구 213만. CMS: cnportal 자체 (cnapcPress board).
//   - list link: <a href="/cnportal/cnapcPressList/cnapcPress/view.do?nttId=N..." class="tit">제목</a>
//   - 본문: detail page 컨테이너
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.chungnam.go.kr";
const LIST_URL =
  "https://www.chungnam.go.kr/cnportal/cnapcPressList/cnapcPress/list.do?menuNo=500498";

const LIST_ITEM_REGEX =
  /<a\s+href="\/cnportal\/cnapcPressList\/cnapcPress\/view\.do\?nttId=(\d+)[^"]*"\s+class="tit">([^<]+)<\/a>/g;

const DATE_REGEX = /(\d{4}-\d{2}-\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<(?:div|td)\s+(?:class|id)="(?:bbs_view|content|board_view|view_content|tbl_view)"[^>]*>([\s\S]*?)<\/(?:div|td)>/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: Array<Omit<PressNewsItem, "publishedDate"> & { idx: number }> = [];
  const seen = new Set<string>();
  const dates: string[] = [];

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  let idx = 0;
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(m[2]).trim();
    if (!title || title.length < 5) continue;
    items.push({
      idx,
      seq,
      title,
      sourceUrl: `${BASE_URL}/cnportal/cnapcPressList/cnapcPress/view.do?nttId=${seq}&menuNo=500498`,
    });
    idx += 1;
  }

  const dateRe = new RegExp(DATE_REGEX.source, "g");
  while ((m = dateRe.exec(html)) !== null) {
    dates.push(m[1]);
  }

  return items.map((item) => ({
    seq: item.seq,
    title: item.title,
    publishedDate: dates[item.idx] ?? null,
    sourceUrl: item.sourceUrl,
  }));
}

export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(m[1])
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length >= 50 ? text : null;
}

export const { scrapeAndInsert: scrapeChungnamAndInsert } = createPressCollector({
  cityName: "충청남도",
  region: "충남",
  ministry: "충청남도청",
  sourceOutlet: "충청남도청",
  sourceCode: "local-press-chungnam",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
