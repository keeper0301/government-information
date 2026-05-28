// ============================================================
// 인천 중구청 보도자료 수집 (2026-05-28)
// ============================================================
// 중구청은 목록과 상세 페이지가 같은 경로 체계(`/krop0231c/{번호}`)를 씁니다.
// 별도 자바스크립트 실행 없이 문서 안에 제목, 제공일자, 본문이 들어 있어
// 일반 웹 요청만으로 수집할 수 있습니다.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.icjg.go.kr";
const LIST_URL = `${BASE_URL}/krop0231c`;

const LIST_ITEM_REGEX =
  /<a\s+href="\/krop0231c\/(\d+)"[^>]*>[\s\S]*?<strong\s+class="subject">([\s\S]*?)<\/strong>[\s\S]*?<dt>\s*제공일자\s*<\/dt>\s*<dd>\s*(\d{4}-\d{2}-\d{2})\s*<\/dd>/g;

const DETAIL_BODY_REGEX =
  /<div\s+class="board-view-contents"[^>]*>([\s\S]{50,60000}?)<div\s+class="btn-set/i;

function cleanText(html: string): string {
  return decodeBasicEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = cleanText(m[2]);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    items.push({
      seq,
      title,
      publishedDate: m[3],
      sourceUrl: `${BASE_URL}/krop0231c/${seq}`,
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const m = DETAIL_BODY_REGEX.exec(html);
  if (!m) return null;

  const text = cleanText(m[1]);
  if (!/[가-힣]/.test(text) || text.length < 50) return null;
  return text.slice(0, 5000);
}

const collector = createPressCollector({
  cityName: "인천 중구",
  region: "인천",
  ministry: "인천 중구청",
  sourceOutlet: "인천 중구청",
  sourceCode: "local-press-junggu-incheon",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});

export const scrapeJungguIncheonAndInsert = collector.scrapeAndInsert;
