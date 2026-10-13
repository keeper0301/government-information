import { load } from "cheerio";
import { createPressCollector, type PressNewsItem } from "./_factory";

// 신문 기사 링크 모음이 아닌 구청 자체 보도자료 게시판입니다.
export const LIST_URL = "https://www.jungnang.go.kr/portal/bbs/list/B0000151.do?menuNo=200474";
export function parseListPage(html: string): PressNewsItem[] {
  const $ = load(html), items: PressNewsItem[] = [], seen = new Set<string>();
  $("tr").each((_, row) => {
    const anchor = $(row).find('a[href*="/portal/bbs/view/B0000151/"]').first();
    const seq = anchor.attr("href")?.match(/\/B0000151\/(\d+)\.do/)?.[1];
    const title = anchor.text().replace(/\s+/g, " ").trim();
    if (!seq || seen.has(seq) || !/[가-힣]/.test(title)) return;
    const date = $(row).find("td").toArray().map(cell => $(cell).text().trim())
      .find(text => /^\d{4}-\d{2}-\d{2}$/.test(text)) ?? null;
    seen.add(seq);
    items.push({ seq, title, publishedDate: date,
      sourceUrl: `https://www.jungnang.go.kr/portal/bbs/view/B0000151/${seq}.do?menuNo=200474` });
  });
  return items;
}
export function parseDetailBody(html: string): string | null {
  const $ = load(html), content = $(".db_data").first();
  content.find("script, style, iframe, noscript, .file-list, .list_pager").remove();
  const text = content.text().replace(/\s+/g, " ").trim();
  return /[가-힣]/.test(text) && text.length >= 250 ? text.slice(0, 20000) : null;
}
export const { scrapeAndInsert: scrapeJungnangAndInsert } = createPressCollector({
  cityName: "중랑구", region: "서울", ministry: "중랑구청", sourceOutlet: "중랑구청",
  sourceCode: "local-press-jungnang", listUrl: LIST_URL, parseListItems: parseListPage, parseDetailBody,
});
