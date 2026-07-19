// ============================================================
// 대전 대덕구청 보도자료 수집 (2026-07-19) — 자치구 확장
// ============================================================
// 공식 보도자료: /dpt/dpt04/DPT040301_cmmBoardList.do
// 목록: DPT040301_cmmBoardView.do?boardId=DPT_000001&ntatcSeq={id}
// 상세: <table class="board_view"> 안 <td class="bmtext"> 본문
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.daedeok.go.kr";
const BOARD_ID = "DPT_000001";
const LIST_PATH = "/dpt/dpt04/DPT040301_cmmBoardList.do";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const LIST_ITEM_REGEX =
  /<tr>[\s\S]*?<td[^>]*class="title"[^>]*>[\s\S]*?<a\s+href="([^"]*DPT040301_cmmBoardView\.do[^"]*ntatcSeq=([0-9]+)[^"]*)"[\s\S]*?<\/a>[\s\S]*?<td>\s*(\d{4})-(\d{2})-(\d{2})\s*<\/td>/g;
const MOBILE_TITLE_REGEX = /<p[^>]*class="mobile_con"[^>]*>[\s\S]*?<\/p>\s*([\s\S]*?)\s*<\/a>/i;
const BODY_REGEX = /<td[^>]*\bclass="bmtext"[^>]*>([\s\S]*?)<\/td>/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((match = itemRe.exec(html)) !== null) {
    const href = decodeBasicEntities(match[1]);
    const seq = match[2];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const row = match[0];
    const titleMatch = row.match(MOBILE_TITLE_REGEX);
    const title = decodeBasicEntities((titleMatch?.[1] ?? "").replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    items.push({
      seq,
      title,
      publishedDate: `${match[3]}-${match[4]}-${match[5]}`,
      sourceUrl: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const match = html.match(BODY_REGEX);
  if (!match) return null;

  const text = decodeBasicEntities(
    match[1]
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

  if (!/[가-힣]/.test(text) || text.length < 250) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeDaedeokAndInsert } =
  createPressCollector({
    cityName: "대전 대덕구",
    region: "대전",
    ministry: "대전 대덕구청",
    sourceOutlet: "대전 대덕구청",
    sourceCode: "local-press-daedeok",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });

export const DAEDEOK_BOARD_ID = BOARD_ID;
