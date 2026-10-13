// 경북 영양군 공식 자료를 가져옵니다. 메뉴와 첨부 목록은 본문에 섞지 않습니다.
import { load } from "cheerio";
import { createPressCollector, type PressNewsItem } from "./_factory";

export const LIST_URL = "https://www.yyg.go.kr/www/organization/yyg_news/explanation_data";

// 각 글이 속한 행 안에서 날짜를 찾아 다른 글의 날짜가 섞이지 않게 합니다.
export function parseListPage(html: string): PressNewsItem[] {
  const $ = load(html);
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  $(".card .tit a[href*=\"mode=view\"]").each((_, element) => {
    const link = $(element);
    const seq = /[?&]idx=(\d+)/.exec(link.attr("href") ?? "")?.[1];
    if (!seq || seen.has(seq)) return;
    const row = link.closest("tr, li, .card, .galleryList");
    const title = (link.attr("title") || link.text()).replace(/\s+/g, " ").trim();
    const dateText = row.find(".exp").first().text() || row.text();
    const date = /(20\d{2})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/.exec(dateText);
    if (title.length < 4 || !/[가-힣]/.test(title)) return;
    let sourceUrl = new URL(link.attr("href")!, LIST_URL).href;
    // 옛 게시판은 보기 명령 2에서 실제 본문 명령 258로 한 번 더 이동합니다.
    sourceUrl = sourceUrl.replace(/([?&])cmd=2(?=&|$)/, "$1cmd=258");
    seen.add(seq);
    items.push({ seq, title, sourceUrl, publishedDate: date ?
      date[1] + "-" + date[2].padStart(2, "0") + "-" + date[3].padStart(2, "0") : null });
  });
  return items;
}

export function parseDetailBody(html: string): string | null {
  const $ = load(html);
  const content = $(".view_box:not(.file_area)").filter((_, node) => $(node).text().trim().length >= 250).first().clone();
  content.find("script, style, .file_area, .attach, .view_next").remove();
  content.find("br").replaceWith("\n");
  content.find("p, div").append("\n");
  const body = content.text().replace(/[ \t\r\u00a0]+/g, " ").replace(/\n\s*/g, "\n").trim();
  if (body.length >= 250 && /[가-힣]/.test(body)) return body.slice(0, 20000);
  return null;
}

const collector = createPressCollector({
  cityName: "경북 영양군", region: "경북", ministry: "경북 영양군청",
  sourceOutlet: "경북 영양군청", sourceCode: "local-press-yeongyang",
  listUrl: LIST_URL, parseListItems: parseListPage, parseDetailBody,
});
export const scrapeYeongyangAndInsert = collector.scrapeAndInsert;
