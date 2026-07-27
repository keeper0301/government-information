// ============================================================
// 대구 서구 보도자료 수집 (2026-07-27)
// ============================================================
// 공식 보도자료: /portal/contents.do?mid=0601080000
// 실제 목록: /portal/board/post/list.do?bcIdx=526&mid=0601080000
// 목록/상세: YH board/post, bcIdx=526, detail idx
// 본문: div.bod_view div.view_cont visible body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.dgs.go.kr";
const BC_IDX = "526";
const MID = "0601080000";
const DIRECT_LIST_URL = `${BASE_URL}/portal/board/post/list.do?bcIdx=${BC_IDX}&mid=${MID}`;

function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/?p\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[\t\r\n\u00a0]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).trim();
}

function normalizeDate(text: string): string | null {
  const m = /(20\d{2})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/.exec(text);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function makeDetailUrl(idx: string): string {
  return `${BASE_URL}/portal/board/post/view.do?bcIdx=${BC_IDX}&mid=${MID}&idx=${encodeURIComponent(idx)}`;
}

export function parseListItems(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1];
    const linkMatch = /<a\b[^>]*href=["']([^"']*\/portal\/board\/post\/view\.do\?[^"']*\bidx=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i.exec(row);
    if (!linkMatch) continue;
    const idx = linkMatch[2];
    if (!idx || seen.has(idx)) continue;
    const title = stripTags(linkMatch[3]);
    if (!title || title.length < 3 || !/[가-힣]/.test(title)) continue;

    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    const publishedDate = normalizeDate(cells.find((cell) => /20\d{2}[-./]\d{1,2}[-./]\d{1,2}/.test(cell)) ?? "");
    seen.add(idx);
    items.push({ seq: idx, title, publishedDate, sourceUrl: makeDetailUrl(idx) });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const bodyMatch = /<div\b[^>]*class=["'][^"']*\bview_cont\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<dl\b[^>]*class=["'][^"']*\bview_file\b|<div\b[^>]*class=["'][^"']*\bopen_license\b)/i.exec(html);
  const bodyHtml = bodyMatch?.[1] ?? /<div\b[^>]*class=["'][^"']*\bview_cont\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1];
  if (!bodyHtml) return null;
  const body = stripTags(bodyHtml);
  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

const collector = createPressCollector({
  cityName: "대구 서구",
  region: "대구",
  ministry: "대구 서구청",
  sourceOutlet: "대구 서구청",
  sourceCode: "local-press-seogu-daegu",
  listUrl: DIRECT_LIST_URL,
  parseListItems,
  parseDetailBody,
});

export const scrapeSeoguDaeguAndInsert = collector.scrapeAndInsert;
