// ============================================================
// 강원특별자치도 평창군청 보도자료 수집 (2026-07-25)
// ============================================================
// 공식 보도자료: /portal/government/government-press/government-press-press
// 목록: skinTb table + articleSeq detail link
// 상세: skinTb-conts는 요약형, HWP 첨부가 전문
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiAttachOrBody } from "./_si_attach_helper";

const BASE_URL = "https://www.pc.go.kr";
const LIST_PATH = "/portal/government/government-press/government-press-press";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
const LINK_REGEX = /<a\b[^>]*href=["']([^"']*\barticleSeq=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const DATE_REGEX = /<td\b[^>]*\bclass\s*=\s*["'][^"']*\bskinTb-date\b[^"']*["'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/i;
const BODY_REGEX =
  /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bskinTb-td\b[^"']*\bskinTb-conts\b[^"']*["'][^>]*>([\s\S]*?)(?:<div\b[^>]*\bclass\s*=\s*["'][^"']*\bskinTb-tr\b|<div\b[^>]*\bclass\s*=\s*["'][^"']*\bskinBtnBo_box\b|<\/div>\s*<\/div>\s*<!--\/\/ 기본게시판 -->)/i;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<span\b[^>]*\bclass\s*=\s*["'][^"']*\bskinColor\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, " ")
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

    const seq = linkMatch[2];
    if (seen.has(seq)) continue;

    const title = stripHtml(linkMatch[3]);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const publishedDate = DATE_REGEX.exec(rowHtml)?.[1] ?? null;

    seen.add(seq);
    items.push({
      seq,
      title,
      publishedDate,
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

export const { scrapeAndInsert: scrapePyeongchangAndInsert } =
  createPressCollector({
    cityName: "평창군",
    region: "강원",
    ministry: "강원특별자치도 평창군청",
    sourceOutlet: "강원특별자치도 평창군청",
    sourceCode: "local-press-pyeongchang",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
