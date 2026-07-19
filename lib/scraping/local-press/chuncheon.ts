// ============================================================
// 강원 춘천시청 보도자료 수집 (2026-07-20) — 강원권 확장
// ============================================================
// 공식 보도자료: /mayor/newsroom/press-release/
// 목록: ?bbsId=BBSMSTR_000000000335&nttId={id}&flag=view
// 상세: /mayor/newsroom/press-release/?bbsId=BBSMSTR_000000000335&nttId={id}&flag=view
// 본문: <div class="board-view-con">...</div>
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.chuncheon.go.kr";
const LIST_URL = `${BASE_URL}/mayor/newsroom/press-release/`;
const BBS_ID = "BBSMSTR_000000000335";

const LIST_ITEM_REGEX =
  /<a\s+href="\/mayor\/newsroom\/press-release\/\?bbsId=BBSMSTR_000000000335&nttId=(\d+)&flag=view"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?<ul\s+class="news-box-info">([\s\S]*?)<\/ul>/g;
const DATE_REGEX = /(\d{4}-\d{2}-\d{2})/;
const BODY_OPEN_REGEX = /<div[^>]*\bclass="board-view-con"[^>]*>/i;

function cleanHtmlText(raw: string): string {
  return decodeBasicEntities(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((match = itemRe.exec(html)) !== null) {
    const seq = match[1];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = cleanHtmlText(match[2])
      .replace(/\s*새글\s*$/, "")
      .replace(/\s*\bNEW\s*$/, "")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = DATE_REGEX.exec(cleanHtmlText(match[3]));

    items.push({
      seq,
      title,
      publishedDate: dateMatch?.[1] ?? null,
      sourceUrl: `${BASE_URL}/mayor/newsroom/press-release/?bbsId=${BBS_ID}&nttId=${seq}&flag=view`,
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const open = BODY_OPEN_REGEX.exec(html);
  if (!open) return null;

  const start = open.index + open[0].length;
  const tagRe = /<(\/?)div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html)) !== null) {
    if (match[1] === "/") {
      depth -= 1;
      if (depth === 0) {
        const text = cleanHtmlText(html.slice(start, match.index));
        if (/[가-힣]/.test(text) && text.length >= 250) {
          return text.slice(0, 20000);
        }
        return null;
      }
    } else {
      depth += 1;
    }
  }

  return null;
}

export const { scrapeAndInsert: scrapeChuncheonAndInsert } =
  createPressCollector({
    cityName: "강원 춘천시",
    region: "강원",
    ministry: "강원 춘천시청",
    sourceOutlet: "강원 춘천시청",
    sourceCode: "local-press-chuncheon",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
