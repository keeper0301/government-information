// ============================================================
// 대전 동구청 보도자료 수집 (2026-07-19) — 자치구 확장
// ============================================================
// 공식 보도자료: /dg/kor/article/newsNSEW
// 목록: article.view('142842') + 제목/등록일/작성자
// 상세: /dg/kor/article/newsNSEW/{articleSeq}
// 본문: <li class="content no_title"><div class="contents">...</div></li>
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://donggu.go.kr";
const LIST_URL = `${BASE_URL}/dg/kor/article/newsNSEW`;

const LIST_ITEM_REGEX =
  /<li>\s*<p class="no">[\s\S]*?<p class="subject align_left">[\s\S]*?article\.view\('([^']+)'\);[\s\S]*?<strong>([\s\S]*?)<\/strong>[\s\S]*?<p class="date">\s*(\d{4})-(\d{2})-(\d{2})\s*<\/p>/g;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((match = itemRe.exec(html)) !== null) {
    const seq = match[1];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = decodeBasicEntities(match[2].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    items.push({
      seq,
      title,
      publishedDate: `${match[3]}-${match[4]}-${match[5]}`,
      sourceUrl: `${LIST_URL}/${seq}`,
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const match = html.match(
    /<li[^>]*class="content no_title"[^>]*>[\s\S]*?<div[^>]*class="contents"[^>]*>([\s\S]*?)<\/div>\s*<\/li>/i,
  );
  if (!match) return null;

  const text = decodeBasicEntities(
    match[1]
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

  if (!/[가-힣]/.test(text) || text.length < 250) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeDongguDaejeonAndInsert } =
  createPressCollector({
    cityName: "대전 동구",
    region: "대전",
    ministry: "대전 동구청",
    sourceOutlet: "대전 동구청",
    sourceCode: "local-press-donggu-daejeon",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
