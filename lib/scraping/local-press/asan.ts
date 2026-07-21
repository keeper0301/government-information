// ============================================================
// 충남 아산시 미디어 보도자료 수집 (2026-07-21) — 충남권 확장
// ============================================================
// 공식 아산시 미디어 뉴스: /develop/m_news/?m_mode=list&cate=news
// 목록: li.swiper-slide / pds_no 기반 카드
// 상세: /develop/m_news/?m_mode=view&pds_no={id}&PageNo=1&cate=news
// 본문: div.article_con
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE = "https://media.asan.go.kr";
const LIST_URL = `${BASE}/develop/m_news/?m_mode=list&cate=news`;

const CARD_REGEX = /<li\b[^>]*class=["'][^"']*\bswiper-slide\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
const PDS_REGEX = /pds_no=(\d{19})/i;
const TITLE_REGEX = /<div\b[^>]*class=["'][^"']*\btxt_area\b[^"']*["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i;
const DATE_REGEX = /<div\b[^>]*class=["'][^"']*\bele_info\b[^"']*["'][^>]*>[\s\S]*?<em[^>]*>\s*(\d{4})\.(\d{2})\.(\d{2})/i;
const DETAIL_TITLE_REGEX = /<div\b[^>]*class=["'][^"']*\barticle_ttl\b[^"']*["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i;
const DETAIL_DATE_REGEX = /<div\b[^>]*class=["'][^"']*\barticle_ttl\b[^"']*["'][^>]*>[\s\S]*?<span[^>]*>\s*(\d{4})\.(\d{2})\.(\d{2})\s*<\/span>/i;
const DETAIL_BODY_REGEX = /<div\b[^>]*class=["'][^"']*\barticle_con\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i;

function stripHtml(html: string): string {
  return decodeBasicEntities(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeDetailUrl(seq: string): string {
  return `${BASE}/develop/m_news/?m_mode=view&pds_no=${seq}&PageNo=1&cate=news`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const cardRe = new RegExp(CARD_REGEX.source, "gi");
  while ((match = cardRe.exec(html)) !== null) {
    const card = match[1];
    const seq = PDS_REGEX.exec(card)?.[1];
    if (!seq || seen.has(seq)) continue;

    const title = stripHtml(TITLE_REGEX.exec(card)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = DATE_REGEX.exec(card);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

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

export function parseDetailBody(html: string): string | null {
  const title = stripHtml(DETAIL_TITLE_REGEX.exec(html)?.[1] ?? "");
  const dateMatch = DETAIL_DATE_REGEX.exec(html);
  const datePrefix = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    : "";
  const bodyHtml = DETAIL_BODY_REGEX.exec(html)?.[1];
  if (!bodyHtml) return null;

  const body = stripHtml(bodyHtml);
  const text = [title, datePrefix, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeAsanAndInsert } =
  createPressCollector({
    cityName: "충남 아산시",
    region: "충남",
    ministry: "충남 아산시청",
    sourceOutlet: "충남 아산시청",
    sourceCode: "local-press-asan",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
