// ============================================================
// 강원특별자치도 정선군청 보도자료 수집 (2026-07-25)
// ============================================================
// 공식 보도자료: /portal/openadmin/adminnews/pressrelease
// 목록: skinTb table + javascript:goPage2('<articleSeq>') detail link
// 상세: skinTb-conts는 요약형, PDF 첨부가 전문
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiAttachOrBody } from "./_si_attach_helper";

const BASE_URL = "https://www.jeongseon.go.kr";
const LIST_PATH = "/portal/openadmin/adminnews/pressrelease";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
const LINK_REGEX = /<a\b[^>]*href=["']javascript:goPage2\(\s*['"](\d+)['"]\s*\);?["'][^>]*>([\s\S]*?)<\/a>/i;
const DATE_REGEX = /<td\b[^>]*\bclass\s*=\s*["'][^"']*\bskinTb-date\b[^"']*["'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/i;
const BODY_REGEX =
  /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bskinTb-td\b[^"']*\bskinTb-conts\b[^"']*["'][^>]*>([\s\S]*?)(?:<div\b[^>]*\bclass\s*=\s*["'][^"']*\bskinTb-tr\b|<div\b[^>]*\bclass\s*=\s*["'][^"']*\bskinBtnBo|<\/div>\s*<\/div>\s*<div\b[^>]*\bclass\s*=\s*["'][^"']*\bskinTb-tr\b)/i;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
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

function makeDetailUrl(seq: string): string {
  return `${LIST_URL}?articleSeq=${seq}`;
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

    const seq = linkMatch[1];
    if (seen.has(seq)) continue;

    const title = stripHtml(linkMatch[2]);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    seen.add(seq);
    items.push({
      seq,
      title,
      publishedDate: DATE_REGEX.exec(rowHtml)?.[1] ?? null,
      sourceUrl: makeDetailUrl(seq),
    });
  }

  return items;
}

export async function parseDetailBody(html: string): Promise<string | null> {
  const attachOrSiBody = await parseSiAttachOrBody(html, BASE_URL);
  if (attachOrSiBody) return attachOrSiBody;
  const visible = stripHtml(BODY_REGEX.exec(html)?.[1] ?? "");
  return /[가-힣]/.test(visible) && visible.length >= 250 ? visible : null;
}

export const { scrapeAndInsert: scrapeJeongseonAndInsert } =
  createPressCollector({
    cityName: "정선군",
    region: "강원",
    ministry: "강원특별자치도 정선군청",
    sourceOutlet: "강원특별자치도 정선군청",
    sourceCode: "local-press-jeongseon",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
