import { load } from "cheerio";
import { createPressCollector, type PressNewsItem } from "./_factory";

// 기존 게시판은 유지하고 변경된 자바스크립트 상세 링크를 읽습니다.
export const LIST_URL = "https://www.ui4u.go.kr/portal/bbs/list.do?mId=0301020000&ptIdx=1709";
export function parseListPage(html: string): PressNewsItem[] {
  const $ = load(html), seen = new Set<string>(), items: PressNewsItem[] = [];
  $("li, tr").each((_, row) => {
    const anchor = $(row).find('a[onclick*="boardView"], a[href*="view.do"]').first();
    const call = anchor.attr("onclick") ?? "", href = anchor.attr("href") ?? "";
    const seq = call.match(/boardView\([^)]*?['"]Y['"]\s*,\s*['"](\d+)['"]\s*,\s*['"]1709['"]/)?.[1]
      ?? href.match(/[?&]bIdx=(\d+)/)?.[1];
    if (!call && !/[?&]ptIdx=1709(?:&|$)/.test(href)) return;
    const title = (anchor.attr("title") || anchor.find(".blog_tit").text() || anchor.text()).replace(/\s+/g, " ").trim();
    if (!seq || seen.has(seq) || !/[가-힣]/.test(title)) return;
    seen.add(seq);
    const dateText = $(row).find(".blog_day, td").text();
    items.push({ seq, title, publishedDate: dateText.match(/\d{4}[.-]\d{2}[.-]\d{2}/)?.[0].replace(/\./g, "-") ?? null,
      sourceUrl: `https://www.ui4u.go.kr/portal/bbs/view.do?bIdx=${seq}&mId=0301020000&ptIdx=1709` });
  });
  return items;
}
export function parseDetailBody(html: string): string | null {
  const $ = load(html), content = $(".view_cont").first();
  content.find("script, style, iframe, noscript, .view_file, .btn, .attach").remove();
  const text = content.text().replace(/\s+/g, " ").trim();
  return /[가-힣]/.test(text) && text.length >= 250 ? text.slice(0, 20000) : null;
}
export const { scrapeAndInsert: scrapeUijeongbuAndInsert } = createPressCollector({
  cityName: "의정부시", region: "경기", ministry: "의정부시청", sourceOutlet: "의정부시청",
  sourceCode: "local-press-uijeongbu", listUrl: LIST_URL, parseListItems: parseListPage, parseDetailBody,
});
