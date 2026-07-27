// ============================================================
// 대구 군위군 보도/해명 수집 (2026-07-27)
// ============================================================
// 공식 보도/해명: /ko/page.do?mnu_uid=106
// 목록: table.tbl_board, bod_uid detail link
// 상세: cmd=258 boardView, visible image-only body + HWP attachment body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { fetchSiAttachBody } from "./_si_attach_helper";

const BASE_URL = "https://www.gunwi.go.kr";
const BASE_DIR = `${BASE_URL}/ko/page.do`;
const MENU_UID = "106";
const LIST_URL = `${BASE_URL}/ko/page.do?mnu_uid=${MENU_UID}`;

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

function makeDetailUrl(bodUid: string): string {
  const params = new URLSearchParams({
    cmd: "258",
    bod_uid: bodUid,
    pageSize: "",
    srchEnable: "1",
    srchSDate: "",
    initDay: "",
    srchKwd: "",
    srchColumn: "",
    listType: "",
    initYear: "",
    srchVote: "-1",
    initMonth: "",
    pageNo: "",
    srchOrder: "",
    srchBgpUid: "-1",
    srchEDate: "",
    mnu_uid: MENU_UID,
  });
  return `${BASE_URL}/ko/page.do?${params.toString()}`;
}

export function parseListItems(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1];
    const linkMatch = /<a\b[^>]*href=["']([^"']*\bbod_uid=(\d+)[^"']*\bcmd=2[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i.exec(row);
    if (!linkMatch) continue;
    const seq = linkMatch[2];
    if (!seq || seen.has(seq)) continue;

    const title = stripTags(linkMatch[3]);
    if (!title || title.length < 3 || !/[가-힣]/.test(title)) continue;

    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    const publishedDate = normalizeDate(cells.find((cell) => /20\d{2}[-./]\d{1,2}[-./]\d{1,2}/.test(cell)) ?? "");

    seen.add(seq);
    items.push({ seq, title, publishedDate, sourceUrl: makeDetailUrl(seq) });
  }

  return items;
}

function extractDivByClass(html: string, className: string): string | null {
  const openRe = new RegExp(
    `<div\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`,
    "i",
  );
  const openMatch = openRe.exec(html);
  if (!openMatch) return null;

  const start = openMatch.index;
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html)) !== null) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return html.slice(openMatch.index + openMatch[0].length, match.index);
    } else {
      depth += 1;
    }
  }
  return html.slice(openMatch.index + openMatch[0].length);
}

function parseVisibleBody(html: string): string | null {
  const bodyHtml = extractDivByClass(html, "cont");
  if (!bodyHtml) return null;
  const body = stripTags(bodyHtml);
  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

export async function parseDetailBody(html: string): Promise<string | null> {
  const attach = await fetchSiAttachBody(html, BASE_DIR, {
    Referer: LIST_URL,
  });
  if (attach) return attach;
  return parseVisibleBody(html);
}

const collector = createPressCollector({
  cityName: "대구 군위군",
  region: "대구",
  ministry: "대구 군위군청",
  sourceOutlet: "대구 군위군청",
  sourceCode: "local-press-gunwi-daegu",
  listUrl: LIST_URL,
  parseListItems,
  parseDetailBody,
});

export const scrapeGunwiDaeguAndInsert = collector.scrapeAndInsert;
