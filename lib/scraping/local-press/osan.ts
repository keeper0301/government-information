// ============================================================
// 경기도 오산시청 보도자료 수집 (2026-07-23)
// ============================================================
// 공식 보도자료: /portal/contents.do?mId=0301080000
// 목록: eGovFrame/YH portal table with goTo.view('list', bIdx, ptIdx, mId)
// 상세: 웹 본문은 1줄 요약이고 전문은 HWP 첨부에 있음.
// ============================================================

import { toMarkdown } from "@ohah/hwpjs";
import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.osan.go.kr";
const LIST_PATH = "/portal/contents.do?mId=0301080000";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;
const DETAIL_PATH = "/portal/bbs/view.do";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const LINK_REGEX = /<a\b[^>]*onclick\s*=\s*["'][^"']*goTo\.view\([^,]+,\s*['"](\d+)['"],\s*['"](\d+)['"],\s*['"](\d+)['"][\s\S]*?<\/a>/i;
const DATE_REGEX = /<td\b[^>]*class\s*=\s*["'][^"']*\blist_date\b[^"']*["'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/i;
const TITLE_REGEX = /<div\b[^>]*class\s*=\s*["'][^"']*\bbod_view\b[^"']*["'][^>]*>[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>/i;
const BODY_REGEX = /<div\b[^>]*class\s*=\s*["'][^"']*\bview_cont\b[^"']*["'][^>]*>([\s\S]*?)<dl\b[^>]*class\s*=\s*["'][^"']*\bview_file\b/i;
const DOWNLOAD_CALL_REGEX =
  /fn_egov_downFile\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/gi;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<span\b[^>]*class\s*=\s*["'][^"']*\bico_new\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&quot;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#39;|&#039;/g, "'")
      .replace(/\r/g, "\n"),
  )
    .replace(/[\u00a0\u200b\ufeff]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanHwpMarkdown(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/`{1,3}/g, "")
    .replace(/~~/g, "")
    .replace(/\*\*/g, "")
    .replace(/^#+\s.*$/gm, "")
    .replace(/^\s*\|[^\n]*\|\s*$/gm, "")
    .replace(/^\s*\|?-{2,}.*$/gm, " ")
    .replace(/\|/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/^버전:\s*[\d.]+\s*/, "");
}

function makeDetailUrl(bIdx: string, ptIdx: string, mId: string): string {
  return `${BASE_URL}${DETAIL_PATH}?mId=${mId}&bIdx=${bIdx}&ptIdx=${ptIdx}`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = ROW_REGEX.exec(html)) !== null) {
    const rowHtml = match[1];
    const linkMatch = LINK_REGEX.exec(rowHtml);
    const dateMatch = DATE_REGEX.exec(rowHtml);
    if (!linkMatch || !dateMatch) continue;

    const [, bIdx, ptIdx, mId] = linkMatch;
    const title = stripHtml(linkMatch[0]);
    if (seen.has(bIdx) || !title || title.length < 5 || !/[가-힣]/.test(title)) {
      continue;
    }

    seen.add(bIdx);
    items.push({
      seq: bIdx,
      title,
      publishedDate: dateMatch[1],
      sourceUrl: makeDetailUrl(bIdx, ptIdx, mId),
    });
  }

  return items;
}

export function parseDownloadUrls(html: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(DOWNLOAD_CALL_REGEX.source, "gi");

  while ((match = re.exec(html)) !== null) {
    const [, atchFileId, fileSn] = match;
    const url = `${BASE_URL}/cmm/fms/FileDown.do?atchFileId=${encodeURIComponent(
      atchFileId,
    )}&fileSn=${encodeURIComponent(fileSn)}`;
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }

  return urls;
}

async function fetchHwpBody(html: string): Promise<string | null> {
  for (const url of parseDownloadUrls(html)) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer[0] !== 0xd0 || buffer[1] !== 0xcf) continue;
      const { markdown } = toMarkdown(buffer, { image: "base64", useHtml: false });
      const text = cleanHwpMarkdown(markdown).replace(/\s+/g, " ").trim();
      if (/[가-힣]/.test(text) && text.length >= 250) {
        return text.slice(0, 20000);
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function parseDetailBody(html: string): Promise<string | null> {
  const hwpBody = await fetchHwpBody(html);
  if (hwpBody) return hwpBody;

  const title = stripHtml(TITLE_REGEX.exec(html)?.[1] ?? "");
  const body = stripHtml(BODY_REGEX.exec(html)?.[1] ?? "");
  const text = [title, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeOsanAndInsert } = createPressCollector({
  cityName: "오산시",
  region: "경기",
  ministry: "경기도 오산시청",
  sourceOutlet: "경기도 오산시청",
  sourceCode: "local-press-osan",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
