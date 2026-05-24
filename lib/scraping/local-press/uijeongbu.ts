// ============================================================
// 의정부시청 보도자료 수집 (2026-05-24) — 경기 batch
// ============================================================
// 의정부시 인구 45만. egov portal/bbs/list.do?mId=0301020000&ptIdx=1709.
// 16,320+ 보도자료 (1632 페이지 × 10).
//
// URL:
//   list:   /portal/bbs/list.do?mId=0301020000&ptIdx=1709
//   상세:   /portal/bbs/view.do?bIdx=N&mId=0301020000&ptIdx=1709
//
// 주의: site node fetch 차단으로 검증 없이 작성.
// silent-fail-detect cron 으로 1주 내 검증.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.ui4u.go.kr";
const LIST_URL =
  "https://www.ui4u.go.kr/portal/bbs/list.do?mId=0301020000&ptIdx=1709";

const LIST_ITEM_REGEX =
  /<a[^>]*href="([^"]*view\.do\?[^"]*bIdx=(\d+)[^"]*)"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:view_cont|board_view|bbs_view|p-view__content|view_content)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:btn|pagination|file|attach|p-view__bottom)|<\/article|<\/section)/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[2];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(
      m[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
    ).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const slice = html.slice(m.index, m.index + 1500);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;
    const detailPath = m[1].startsWith("http") ? m[1] : `${BASE_URL}${m[1]}`;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: detailPath,
    });
  }
  return items;
}

export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(m[1])
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[가-힣]/.test(text) || text.length < 50) return null;
  return text.slice(0, 5000);
}

export const { scrapeAndInsert: scrapeUijeongbuAndInsert } =
  createPressCollector({
    cityName: "의정부시",
    region: "경기",
    ministry: "의정부시청",
    sourceOutlet: "의정부시청",
    sourceCode: "local-press-uijeongbu",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
