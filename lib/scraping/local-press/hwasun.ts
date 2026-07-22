// ============================================================
// 전남 화순군청 화순포커스 수집 (2026-07-22) — 전남권 확장
// ============================================================
// 공식 군정뉴스: /gallery.do?S=S01&M=020101000000&b_code=0000000001
// 목록: gallery SK3 cards + list_no detail link
// 상세: boardR / ga_vew_cont article body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.hwasun.go.kr";
const LIST_PATH = "/gallery.do?S=S01&M=020101000000&b_code=0000000001";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const DETAIL_LINK_REGEX =
  /<a\b[^>]*href=["']([^"']*\/gallery\.do\?[^"']*\bb_code=0000000001[^"']*\bact=view[^"']*\blist_no=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
const TITLE_TAG_REGEX = /<title>\s*상세보기\s*\|\s*([^|<]+?)\s*\|/i;
const LIST_TITLE_REGEX = /<span\b[^>]*class=["'][^"']*\btit\b[^"']*["'][^>]*>([\s\S]*?)<\/span>|<strong\b[^>]*>([\s\S]*?)<\/strong>|<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/i;
const LIST_DATE_REGEX = /(\d{4})[-.](\d{2})[-.](\d{2})/;
const DETAIL_TITLE_REGEX = /<p\b[^>]*class=["'][^"']*\bboViewtitle\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i;
const DETAIL_DATE_REGEX = /등록일\s*:\s*(\d{4})-(\d{2})-(\d{2})/i;
const DETAIL_BODY_REGEX = /<div\b[^>]*class=["']ga_vew_cont["'][^>]*>([\s\S]*?)<\/div>/i;

function stripHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/dd>/gi, "\n")
      .replace(/<\/dt>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/span>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#39;|&#039;/g, "'")
      .replace(/&#40;/g, "(")
      .replace(/&#41;/g, ")")
      .replace(/\r/g, "\n"),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanTitle(raw: string): string {
  return stripHtml(raw)
    .replace(/^\d{4}[-.]\d{2}[-.]\d{2}\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDate(match: RegExpExecArray | null): string | null {
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function makeAbsoluteUrl(href: string): string {
  return new URL(href.replace(/&amp;/g, "&"), LIST_URL).toString();
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const linkRe = new RegExp(DETAIL_LINK_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = linkRe.exec(html)) !== null) {
    const href = match[1];
    const seq = match[2];
    if (seen.has(seq)) continue;

    const matchIndex = match.index;
    const matchEnd = match.index + match[0].length;
    const cardStart = Math.max(
      html.lastIndexOf("<li", matchIndex),
      html.lastIndexOf('<div class="gaList"', matchIndex),
      html.lastIndexOf('<div class="galleryList"', matchIndex),
    );
    const cardEndCandidates = ["</li>", "</div>"].map((tag) => {
      const idx = html.indexOf(tag, matchEnd);
      return idx === -1 ? Number.POSITIVE_INFINITY : idx + tag.length;
    });
    const cardEnd = Math.min(...cardEndCandidates);
    const cardHtml = html.slice(
      cardStart === -1 ? matchIndex : cardStart,
      Number.isFinite(cardEnd) ? cardEnd : matchIndex + match[0].length + 1800,
    );
    const titleMatch = LIST_TITLE_REGEX.exec(cardHtml);
    const title = cleanTitle(
      titleMatch?.[1] ?? titleMatch?.[2] ?? titleMatch?.[3] ?? match[3] ?? "",
    );
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    seen.add(seq);
    items.push({
      seq,
      title,
      publishedDate: normalizeDate(LIST_DATE_REGEX.exec(cardHtml)),
      sourceUrl: makeAbsoluteUrl(href),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const title = cleanTitle(
    DETAIL_TITLE_REGEX.exec(html)?.[1] ?? TITLE_TAG_REGEX.exec(html)?.[1] ?? "",
  );
  const date = normalizeDate(DETAIL_DATE_REGEX.exec(html));
  const body = stripHtml(DETAIL_BODY_REGEX.exec(html)?.[1] ?? "");
  const text = [title, date, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeHwasunAndInsert } = createPressCollector({
  cityName: "전남 화순군",
  region: "전남",
  ministry: "전남 화순군청",
  sourceOutlet: "전남 화순군청",
  sourceCode: "local-press-hwasun",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
