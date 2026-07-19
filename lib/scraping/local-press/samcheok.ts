// ============================================================
// 강원 삼척시청 보도자료 수집 (2026-07-20) — 강원권 확장
// ============================================================
// 공식 보도자료: /media/00084/00094.web?gcode=1006
// 목록: ?gcode=1006&idx={id}&amode=view&
// 상세: /media/00084/00094.web?gcode=1006&idx={id}&amode=view&
// 본문: <div class="substance">...</div>
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.samcheok.go.kr";
const LIST_URL = `${BASE_URL}/media/00084/00094.web?gcode=1006`;
const DETAIL_BASE = `${BASE_URL}/media/00084/00094.web?gcode=1006&amode=view&idx=`;

const LIST_ITEM_REGEX =
  /<a\s+href="\?gcode=1006&amp;idx=(\d+)&amp;amode=view&amp;"\s+class="a1"[^>]*>[\s\S]*?<strong\s+class="t1"[^>]*>([\s\S]*?)<\/strong>/g;
const DATE_REGEX = /<span\s+class="t3"[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/span>/g;
const BODY_OPEN_REGEX = /<div[^>]*\bclass="substance"[^>]*>/i;

function cleanHtmlText(raw: string): string {
  return decodeBasicEntities(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: Array<Omit<PressNewsItem, "publishedDate"> & { index: number }> =
    [];
  const seen = new Set<string>();
  const dates: string[] = [];

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

    items.push({
      index: items.length,
      seq,
      title,
      sourceUrl: `${DETAIL_BASE}${seq}`,
    });
  }

  const dateRe = new RegExp(DATE_REGEX.source, "g");
  while ((match = dateRe.exec(html)) !== null) {
    dates.push(match[1]);
  }

  return items.map((item) => ({
    seq: item.seq,
    title: item.title,
    publishedDate: dates[item.index] ?? null,
    sourceUrl: item.sourceUrl,
  }));
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
        const text = cleanHtmlText(html.slice(start, match.index)).replace(
          /^[^가-힣]*/,
          "",
        );
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

export const { scrapeAndInsert: scrapeSamcheokAndInsert } =
  createPressCollector({
    cityName: "강원 삼척시",
    region: "강원",
    ministry: "강원 삼척시청",
    sourceOutlet: "강원 삼척시청",
    sourceCode: "local-press-samcheok",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
