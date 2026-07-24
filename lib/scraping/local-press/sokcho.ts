// ============================================================
// 강원특별자치도 속초시청 보도자료 수집 (2026-07-24)
// ============================================================
// 공식 보도자료: /sc/portal/sokchonews/pressrelease
// 목록: CMPE magazine pseudo-table cards with data-seq links
// 상세: skinTb detail view with skinTb-conts body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://sokcho.go.kr";
const LIST_URL = `${BASE_URL}/sc/portal/sokchonews/pressrelease`;

const CARD_START_REGEX = /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bid-magazin\b[^"']*["'][^>]*>/gi;
const SEQ_LINK_REGEX = /<a\b[^>]*\bclass\s*=\s*["'][^"']*\bgoPage\b[^"']*["'][^>]*\bdata-seq\s*=\s*["'](\d+)["'][^>]*>/i;
const TITLE_REGEX = /<span\b[^>]*\bclass\s*=\s*["'][^"']*\bskinColor-fmInfo\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i;
const DATE_REGEX = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const BODY_REGEX = /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bskinTb-td\b[^"']*\bskinTb-conts\b[^"']*["'][^>]*>([\s\S]*?)(?:<div\b[^>]*\bclass\s*=\s*["'][^"']*\bskinBtnBo_box\b|<div\b[^>]*\bclass\s*=\s*["'][^"']*\bboGallery-img\b|<div\b[^>]*\bclass\s*=\s*["'][^"']*\bcopyright|<form\b|<\/div>\s*<\/div>\s*<div\b[^>]*\bclass\s*=\s*["'][^"']*\bskinBtnBo_box)/i;
const BODY_FALLBACK_REGEX = /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bskinTb-td\b[^"']*\bskinTb-conts\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&hellip;/g, "…")
      .replace(/&middot;/g, "·")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#039;/g, "'")
      .replace(/\r/g, "\n"),
  )
    .replace(/[\u00a0\u200b\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cardSlices(html: string): string[] {
  const starts = [...html.matchAll(CARD_START_REGEX)].map((m) => m.index ?? 0);
  return starts.map((start, idx) => html.slice(start, starts[idx + 1] ?? html.length));
}

function makeDetailUrl(seq: string): string {
  return `${LIST_URL}?articleSeq=${seq}`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  for (const cardHtml of cardSlices(html)) {
    const seqMatch = SEQ_LINK_REGEX.exec(cardHtml);
    if (!seqMatch) continue;
    const seq = seqMatch[1];
    if (seen.has(seq)) continue;

    const title = stripHtml(TITLE_REGEX.exec(cardHtml)?.[1] ?? "");
    const dateMatch = DATE_REGEX.exec(cardHtml);
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

export function parseDetailBody(html: string): string | null {
  const bodyMatch = BODY_REGEX.exec(html) ?? BODY_FALLBACK_REGEX.exec(html);
  if (!bodyMatch) return null;
  const text = stripHtml(bodyMatch[1])
    .replace(/첨부파일\s*다운로드\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[가-힣]/.test(text) || text.length < 250) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeSokchoAndInsert } = createPressCollector({
  cityName: "속초시",
  region: "강원",
  ministry: "강원특별자치도 속초시청",
  sourceOutlet: "강원특별자치도 속초시청",
  sourceCode: "local-press-sokcho",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
