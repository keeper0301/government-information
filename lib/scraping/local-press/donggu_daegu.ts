// ============================================================
// 대구 동구 보도자료 수집 (2026-07-27)
// ============================================================
// 공식 보도자료: /portal/contents.do?mid=0201070000
// 실제 목록: /portal/saeol/news/list.do?mid=0201070000&token=...
// 목록/상세: SAEOL news board, req.post data-keyset newsEpctNo
// 본문: div.bod_view div.view_cont visible body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.dong.daegu.kr";
const LIST_URL = `${BASE_URL}/portal/contents.do?mid=0201070000`;

function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).trim();
}

function normalizeDate(text: string): string | null {
  const m = /(20\d{2})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/.exec(text);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function makeDetailUrl(newsEpctNo: string): string {
  return `${BASE_URL}/portal/saeol/news/view.do?newsEpctNo=${encodeURIComponent(
    newsEpctNo,
  )}&mid=0201070000`;
}

export function parseListItems(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1];
    const linkMatch = /<a\b[^>]*data-action=["']\/portal\/saeol\/news\/view\.do["'][^>]*data-keyset=(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/i.exec(row);
    if (!linkMatch) continue;
    const seq = /newsEpctNo['"]?\s*:\s*['"]?(\d+)/i.exec(linkMatch[2])?.[1];
    const titleHtml = linkMatch[3];
    if (!seq || seen.has(seq)) continue;
    const title = stripTags(titleHtml);
    if (!title || title.length < 3 || !/[가-힣]/.test(title)) continue;

    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    const publishedDate = normalizeDate(cells[3] ?? "");
    seen.add(seq);
    items.push({ seq, title, publishedDate, sourceUrl: makeDetailUrl(seq) });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const bodyMatch = /<div\b[^>]*class=["'][^"']*\bview_cont\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<dl\b[^>]*class=["'][^"']*\bview_file\b/i.exec(html);
  const bodyHtml = bodyMatch?.[1] ?? /<div\b[^>]*class=["'][^"']*\bview_cont\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1];
  if (!bodyHtml) return null;
  const body = stripTags(bodyHtml);
  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

const collector = createPressCollector({
  cityName: "대구 동구",
  region: "대구",
  ministry: "대구 동구청",
  sourceOutlet: "대구 동구청",
  sourceCode: "local-press-donggu-daegu",
  listUrl: LIST_URL,
  parseListItems,
  parseDetailBody,
});

export const scrapeDongguDaeguAndInsert = collector.scrapeAndInsert;
