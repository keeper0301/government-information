// ============================================================
// 강원 홍천군청 보도자료 수집 (2026-07-20) — 강원권 확장
// ============================================================
// 공식 보도자료: /www/selectEminwonNewsList.do?key=283&ofr_pageSize=10
// 목록: selectEminwonNewsView.do?...&news_epct_no={id}
// 상세: /www/selectEminwonNewsView.do?key=283&news_epct_no={id}&ofr_pageSize=10
// 본문: <table class="p-table ..."> 제목 다음 <td colspan="4">...</td>
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.hongcheon.go.kr";
const LIST_URL = `${BASE_URL}/www/selectEminwonNewsList.do?key=283&ofr_pageSize=10`;
const DETAIL_BASE = `${BASE_URL}/www/selectEminwonNewsView.do?key=283&ofr_pageSize=10&news_epct_no=`;

const LIST_ITEM_REGEX =
  /<td\s+class="p-subject"[^>]*>\s*<a\s+href="\.\/selectEminwonNewsView\.do\?[^">]*news_epct_no=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>(\d{4}-\d{2}-\d{2})<\/td>/g;
const BODY_REGEX =
  /<tr\s+class="p-table__subject"[\s\S]*?<\/tr>\s*<tr>\s*<td\s+colspan="4"[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/i;

function cleanHtmlText(raw: string): string {
  return decodeBasicEntities(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((match = itemRe.exec(html)) !== null) {
    const seq = match[1];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = cleanHtmlText(match[2])
      .replace(/\s*새글\s*$/, "")
      .replace(/\s*\bNEW\s*$/, "")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    items.push({
      seq,
      title,
      publishedDate: match[4],
      sourceUrl: `${DETAIL_BASE}${seq}`,
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const match = BODY_REGEX.exec(html);
  if (!match) return null;

  const text = cleanHtmlText(match[1]);
  if (/[가-힣]/.test(text) && text.length >= 250) {
    return text.slice(0, 20000);
  }
  return null;
}

export const { scrapeAndInsert: scrapeHongcheonAndInsert } =
  createPressCollector({
    cityName: "강원 홍천군",
    region: "강원",
    ministry: "강원 홍천군청",
    sourceOutlet: "강원 홍천군청",
    sourceCode: "local-press-hongcheon",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
