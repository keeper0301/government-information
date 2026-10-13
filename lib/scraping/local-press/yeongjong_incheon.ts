import { load } from "cheerio";
import { createPressCollector, type PressNewsItem } from "./_factory";

export const LIST_URL = "https://www.yeongjong.go.kr/main/pst/list.do?pst_id=mn_news_yj";
export function parseListPage(html: string): PressNewsItem[] {
  const $ = load(html), seen = new Set<string>(), items: PressNewsItem[] = [];
  $("tr").each((_, row) => {
    const anchor = $(row).find('a[href*="pst_id=mn_news_yj"][href*="pst_sn="]').first();
    const seq = anchor.attr("href")?.match(/[?&]pst_sn=(\d+)/)?.[1];
    const title = anchor.text().replace(/\s+/g, " ").trim();
    if (!seq || seen.has(seq) || !/[가-힣]/.test(title)) return;
    seen.add(seq);
    const date = $(row).find('td[data-th="등록일"]').text().trim();
    items.push({ seq, title, publishedDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      sourceUrl: `https://www.yeongjong.go.kr/main/pst/view.do?pst_id=mn_news_yj&pst_sn=${seq}` });
  });
  return items;
}
export function parseDetailBody(html: string): string | null {
  const $ = load(html), content = $(".board_content .editor_content").first();
  // 본문에 포함된 한글 편집기 문장은 보존하고 첨부·화면 동작만 제외합니다.
  content.find("script,style,iframe,noscript,.board_file").remove();
  const body = content.text().replace(/\s+/g, " ").trim();
  return body.length >= 250 && /[가-힣]/.test(body) ? body.slice(0, 20000) : null;
}
export const { scrapeAndInsert: scrapeYeongjongIncheonAndInsert } = createPressCollector({
  cityName: "영종구", region: "인천", ministry: "영종구청", sourceOutlet: "영종구청",
  sourceCode: "local-press-yeongjong-incheon", listUrl: LIST_URL, parseListItems: parseListPage, parseDetailBody,
});
