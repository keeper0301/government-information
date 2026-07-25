// ============================================================
// 강원특별자치도 인제군청 보도자료 수집 (2026-07-25)
// ============================================================
// 공식 보도자료: /portal/inje-news/inje-pr/briefing
// 목록: skinTb table + articleSeq detail link
// 상세: skinTb-conts는 요약형, PDF 첨부가 전문
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiAttachOrBody } from "./_si_attach_helper";

const BASE_URL = "https://www.inje.go.kr";
const LIST_PATH = "/portal/inje-news/inje-pr/briefing";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
const LINK_REGEX = /<a\b[^>]*href=["']([^"']*\barticleSeq=(\d+)[^"']*)["'][^>]*>([\s\S]*?)(?:<\/a>|<\/td>)/i;
const DATE_REGEX = /<td\b[^>]*\bclass\s*=\s*["'][^"']*\bskinTb-date\b[^"']*["'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/i;
const TITLE_REGEX = /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bskinTb-td\b[^"']*\bskinTb-sbj\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i;
const DATE_DETAIL_REGEX = /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bskinTb-td\b[^"']*\bskinTb-date\b[^"']*["'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/div>/i;
const BODY_REGEX =
  /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bskinTb-td\b[^"']*\bskinTb-conts\b[^"']*["'][^>]*>([\s\S]*?)(?:<div\b[^>]*\bclass\s*=\s*["'][^"']*\bskinTb-tr\b|<\/div>\s*<\/div>\s*<div\b[^>]*\bclass\s*=\s*["'][^"']*\bskinTb-tr\b)/i;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n")
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
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeDetailUrl(articleSeq: string): string {
  return `${BASE_URL}${LIST_PATH}?articleSeq=${articleSeq}`;
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

    const articleSeq = linkMatch[2];
    if (seen.has(articleSeq)) continue;

    const title = stripHtml(linkMatch[3]);
    const date = DATE_REGEX.exec(rowHtml)?.[1] ?? null;
    if (!title || !date) continue;

    seen.add(articleSeq);
    items.push({
      seq: articleSeq,
      title,
      publishedDate: date,
      sourceUrl: makeDetailUrl(articleSeq),
    });
  }

  return items;
}

function parseVisibleBody(html: string): string | null {
  const title = stripHtml(TITLE_REGEX.exec(html)?.[1] ?? "");
  const date = DATE_DETAIL_REGEX.exec(html)?.[1];
  const body = stripHtml(BODY_REGEX.exec(html)?.[1] ?? "");
  const text = [title, date ? `등록일 ${date}` : null, body].filter(Boolean).join("\n\n");
  return /[가-힣]/.test(text) && text.length >= 250 ? text.slice(0, 20000) : null;
}

export async function parseDetailBody(html: string): Promise<string | null> {
  const attach = await parseSiAttachOrBody(html, BASE_URL);
  return attach ?? parseVisibleBody(html);
}

export const { scrapeAndInsert: scrapeInjeAndInsert } = createPressCollector({
  cityName: "인제군",
  region: "강원",
  ministry: "강원특별자치도 인제군청",
  sourceOutlet: "강원특별자치도 인제군청",
  sourceCode: "local-press-inje",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
