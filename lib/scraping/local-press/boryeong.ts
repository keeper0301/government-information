// ============================================================
// 충남 보령시청 보도자료 수집 (2026-07-21) — 충남권 확장
// ============================================================
// 공식 보도자료: /prog/eminwon/kor/AA/sub04_02/list.do
// 목록: 보령시청 shell 안의 eminwon 새올 보도자료 table
// 상세: http://eminwon.brcn.go.kr/.../OfrAction.do?...news_epct_no={id}
// 본문: 보도자료 상세조회 table 내 colspan="4" 본문 td
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const LIST_URL = "https://www.brcn.go.kr/prog/eminwon/kor/AA/sub04_02/list.do";
const DETAIL_BASE =
  "http://eminwon.brcn.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do";

const ROW_REGEX = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
const DETAIL_ONCLICK_REGEX = /popupCenter\('([^']*news_epct_no=(\d+)[^']*)'/i;
const TITLE_REGEX = /<span\b[^>]*class=["'][^"']*\blink\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i;
const DATE_REGEX = /<td\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>\s*(\d{4})-(\d{2})-(\d{2})\s*<\/td>/i;
const DETAIL_TITLE_REGEX = /<th[^>]*>\s*제목\s*<\/th>\s*<td\b[^>]*colspan=["']?3["']?[^>]*>([\s\S]*?)<\/td>/i;
const DETAIL_DATE_REGEX = /<th[^>]*>\s*등록일자\s*<\/th>\s*<th[^>]*>\s*(\d{4})-(\d{2})-(\d{2})\s*<\/th>/i;
const DETAIL_BODY_REGEX = /<td\b(?=[^>]*colspan=["']?4["']?)(?=[^>]*word-break:break-all)[^>]*>([\s\S]*?)<\/td>/i;

function stripHtml(html: string): string {
  return decodeBasicEntities(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeDetailUrl(seq: string): string {
  const params = new URLSearchParams({
    method: "selectOfrNews",
    methodnm: "selectOfrNewsMgt",
    jndinm: "OfrBcAdvNewsEJB",
    context: "NTIS",
    subCheck: "N",
    data_open_yn: "1",
    initValue: "Y",
    countYn: "Y",
    news_epct_no: seq,
  });
  return `${DETAIL_BASE}?${params.toString()}`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const rowRe = new RegExp(ROW_REGEX.source, "g");
  while ((match = rowRe.exec(html)) !== null) {
    const row = match[1];
    const link = DETAIL_ONCLICK_REGEX.exec(row);
    if (!link) continue;

    const seq = link[2];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(TITLE_REGEX.exec(row)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = DATE_REGEX.exec(row);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

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

export const { scrapeAndInsert: scrapeBoryeongAndInsert } =
  createPressCollector({
    cityName: "충남 보령시",
    region: "충남",
    ministry: "충남 보령시청",
    sourceOutlet: "충남 보령시청",
    sourceCode: "local-press-boryeong",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
