// ============================================================
// 강원특별자치도 횡성군청 보도자료 수집 (2026-07-24)
// ============================================================
// 공식 보도자료: /www/selectBbsNttList.do?key=827&bbsNo=67
// 목록: SI p-table 목록 with selectBbsNttView links
// 상세: p-table__content는 제목뿐인 thin body, PDF 첨부가 전문
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiAttachOrBody } from "./_si_attach_helper";

const BASE_URL = "https://www.hsg.go.kr";
const BBS_NO = "67";
const KEY = "827";
const LIST_URL = `${BASE_URL}/www/selectBbsNttList.do?key=${KEY}&bbsNo=${BBS_NO}&pageUnit=10&searchCnd=all`;
const DETAIL_BASE = `${BASE_URL}/www/`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
const LINK_REGEX = /selectBbsNttView\.do(?:;[^?"']*)?\?[^"']*?bbsNo=67[^"']*?nttNo=(\d+)[^"']*?["']/i;
const TITLE_REGEX = /<td\b[^>]*\bclass\s*=\s*["'][^"']*\bp-subject\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/td>/i;
const DATE_REGEX = /\b(\d{4})-(\d{2})-(\d{2})\b/;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<span\b[^>]*\bclass\s*=\s*["'][^"']*\bp-icon[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&#40;|&lpar;/g, "(")
      .replace(/&#41;|&rpar;/g, ")")
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
  return `${BASE_URL}/www/selectBbsNttView.do?key=${KEY}&bbsNo=${BBS_NO}&nttNo=${seq}&pageUnit=10&searchCnd=all`;
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

    const title = stripHtml(TITLE_REGEX.exec(rowHtml)?.[1] ?? "");
    const dateMatch = DATE_REGEX.exec(rowHtml);
    const publishedDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null;
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

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
  return parseSiAttachOrBody(html, DETAIL_BASE);
}

export const { scrapeAndInsert: scrapeHoengseongAndInsert } = createPressCollector({
  cityName: "횡성군",
  region: "강원",
  ministry: "강원특별자치도 횡성군청",
  sourceOutlet: "강원특별자치도 횡성군청",
  sourceCode: "local-press-hoengseong",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
