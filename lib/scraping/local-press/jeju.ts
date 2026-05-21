import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.jeju.go.kr";
const LIST_URL = "https://www.jeju.go.kr/news/bodo/list.htm";

const LIST_ITEM_REGEX =
  /<li\s+class="board-news__article"[^>]*>[\s\S]*?<a\s+href="\/news\/bodo\/list\.htm\?act=view&amp;seq=(\d+)"[^>]*>[\s\S]*?<strong\s+class="text-ellipsis"[^>]*>([\s\S]*?)<\/strong>[\s\S]*?<span\s+class="date"[^>]*>[\s\S]*?\|\s*(\d{4}-\d{2}-\d{2})\s*<\/span>[\s\S]*?<\/li>/g;

// 2026-05-22 fix — site 가 id="articleContents" → class="article-contents" 변경.
// 새 selector + legacy id fallback.
const BODY_CONTAINER_REGEX =
  /<div\s+class="article-contents[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="file-preview|<div\s+class="article-files|<aside)/i;
const BODY_CONTAINER_REGEX_LEGACY =
  /<div\s+id="articleContents"[^>]*>([\s\S]*?)<div\s+id="popularNews"/i;

function toText(html: string): string {
  return decodeBasicEntities(html)
    .replace(/<div\s+class="file-preview"[\s\S]*?<\/div>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = toText(m[2]);
    if (!title || title.length < 5) continue;
    items.push({
      seq,
      title,
      publishedDate: m[3],
      sourceUrl: `${BASE_URL}/news/bodo/list.htm?act=view&seq=${seq}`,
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const m = BODY_CONTAINER_REGEX.exec(html) ?? BODY_CONTAINER_REGEX_LEGACY.exec(html);
  if (!m) return null;
  const text = toText(m[1]);
  return text.length >= 50 ? text : null;
}

export const { scrapeAndInsert: scrapeJejuAndInsert } = createPressCollector({
  cityName: "제주특별자치도",
  region: "제주",
  ministry: "제주특별자치도청",
  sourceOutlet: "제주특별자치도청",
  sourceCode: "local-press-jeju",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
