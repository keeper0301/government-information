import { load } from "cheerio";
import { createPressCollector, type PressNewsItem } from "./_factory";

export const LIST_URL = "https://www.seogwipo.go.kr/news/seogwiponews/sijungnews.htm";
export function parseListPage(html: string): PressNewsItem[] {
  const $ = load(html), seen = new Set<string>(), items: PressNewsItem[] = [];
  $("li, .blog-board-list > .list").each((_, row) => {
    const anchor = $(row).find('p.title a[href*="/news/seogwiponews/sijungnews.htm?"]').first();
    const href = anchor.attr("href"), seq = href?.match(/[?&]seq=(\d+)/)?.[1];
    const title = anchor.text().replace(/\s+/g, " ").trim();
    if (!seq || !href?.includes("act=view") || seen.has(seq) || !/[가-힣]/.test(title)) return;
    seen.add(seq);
    items.push({ seq, title, publishedDate: $(row).find("p.date").text().match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null,
      sourceUrl: `${LIST_URL}?act=view&seq=${seq}` });
  });
  return items;
}
export function parseDetailBody(html: string): string | null {
  const $ = load(html), content = $(".view-contents").first();
  // 사진·첨부·미리보기·스크립트는 기사 본문에 합치지 않습니다.
  content.find("script, style, iframe, noscript, .gallery-img-list, .file-preview, .article-files").remove();
  const text = content.text().replace(/\s+/g, " ").trim();
  return /[가-힣]/.test(text) && text.length >= 250 ? text.slice(0, 20000) : null;
}
export const { scrapeAndInsert: scrapeSeogwipoAndInsert } = createPressCollector({
  cityName: "서귀포시", region: "제주", ministry: "서귀포시청", sourceOutlet: "서귀포시청",
  sourceCode: "local-press-seogwipo", listUrl: LIST_URL, parseListItems: parseListPage, parseDetailBody,
});

