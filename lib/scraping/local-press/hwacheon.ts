// ============================================================
// 강원특별자치도 화천군청 보도자료 수집 (2026-07-25)
// ============================================================
// 공식 보도자료: /media/selectBbsNttList.do?bbsNo=91&key=900
// 목록: media 서브사이트 bbs_default list table
// 상세: bbs_content 요약 + HWP 첨부 전문
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiAttachOrBody } from "./_si_attach_helper";

const BASE_URL = "https://www.ihc.go.kr";
const LIST_URL = `${BASE_URL}/media/selectBbsNttList.do?bbsNo=91&key=900`;
const DETAIL_BASE = `${BASE_URL}/media/`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
const LINK_REGEX = /<a\b[^>]*href=["']([^"']*selectBbsNttView\.do\?[^"']*\bbbsNo=91[^"']*\bnttNo=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const DATE_REGEX = /<td\b[^>]*\bclass\s*=\s*["'][^"']*\blast\b[^"']*["'][^>]*>\s*([\s\S]*?\d{4}\.\d{2}\.\d{2}[\s\S]*?)<\/td>/i;
const BODY_REGEX =
  /<td\b(?=[^>]*\bclass\s*=\s*["'][^"']*\bbbs_content\b)[^>]*>([\s\S]*?)<\/td>/i;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<img\b[^>]*alt=["']새글["'][^>]*>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&hellip;/g, "…")
      .replace(/&middot;/g, "·")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#039;/g, "'"),
  )
    .replace(/[\u00a0\u200b\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /(\d{4})[.\-/](\d{2})[.\-/](\d{2})/.exec(stripHtml(raw));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function canonicalDetailUrl(rawHref: string): string {
  const normalized = decodeBasicEntities(rawHref).replace(/&amp;/g, "&");
  const url = new URL(normalized, DETAIL_BASE);
  const nttNo = url.searchParams.get("nttNo") ?? "";
  return `${BASE_URL}/media/selectBbsNttView.do?key=900&bbsNo=91&nttNo=${nttNo}&pageIndex=1`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const rowRe = new RegExp(ROW_REGEX.source, "g");

  while ((match = rowRe.exec(html)) !== null) {
    const rowHtml = match[1];
    const linkMatch = LINK_REGEX.exec(rowHtml);
    if (!linkMatch) continue;

    const rawHref = linkMatch[1];
    const seq = linkMatch[2];
    if (seen.has(seq)) continue;

    const title = stripHtml(linkMatch[3]);
    if (!title || title.length < 5) continue;

    seen.add(seq);
    items.push({
      seq,
      title,
      publishedDate: normalizeDate(DATE_REGEX.exec(rowHtml)?.[1]),
      sourceUrl: canonicalDetailUrl(rawHref),
    });
  }

  return items;
}

export async function parseDetailBody(html: string): Promise<string | null> {
  const attachOrSiBody = await parseSiAttachOrBody(html, `${BASE_URL}/media/`);
  if (attachOrSiBody) return attachOrSiBody;
  const visible = stripHtml(BODY_REGEX.exec(html)?.[1] ?? "");
  return /[가-힣]/.test(visible) && visible.length >= 250 ? visible : null;
}

export const { scrapeAndInsert: scrapeHwacheonAndInsert } = createPressCollector({
  cityName: "화천군",
  region: "강원",
  ministry: "강원특별자치도 화천군청",
  sourceOutlet: "강원특별자치도 화천군청",
  sourceCode: "local-press-hwacheon",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
