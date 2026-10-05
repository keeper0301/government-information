import { load } from "cheerio";
import { createPressCollector, type PressNewsItem } from "./_factory";

// 구청 보도자료 메뉴가 직접 연결하는 공식 새올 게시판입니다.
const ACTION_URL = "https://eminwon.namgu.gwangju.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do";
function makeUrl(seq?: string): string {
  const params = new URLSearchParams({ jndinm: "OfrBcAdvNewsEJB", context: "NTIS",
    method: seq ? "selectOfrNews" : "selectListOfrNews",
    methodnm: seq ? "selectOfrNewsMgt" : "selectListOfrNewsHomepage",
    subCheck: "Y", ofr_pageSize: "10", news_epct_yn: "1", homepage_pbs_yn: "Y" });
  if (seq) params.set("news_epct_no", seq);
  return `${ACTION_URL}?${params}`;
}
export const LIST_URL = makeUrl();
export function parseListPage(html: string): PressNewsItem[] {
  const $ = load(html), seen = new Set<string>(), items: PressNewsItem[] = [];
  $(".dbody > ul").each((_, row) => {
    const anchor = $(row).find(".title a[onclick*=searchDetail]").first();
    const seq = anchor.attr("onclick")?.match(/searchDetail\(['"](\d+)['"]\)/)?.[1];
    const title = anchor.text().replace(/\s+/g, " ").trim();
    if (!seq || seen.has(seq) || !/[가-힣]/.test(title)) return;
    seen.add(seq);
    const date = $(row).find(".col04").text().trim();
    items.push({ seq, title, publishedDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, sourceUrl: makeUrl(seq) });
  });
  return items;
}
export function parseDetailBody(html: string): string | null {
  const $ = load(html), content = $(".tstyle_view .tb_contents, .tb_contents").first();
  content.find("script,style,iframe,noscript,.add_file").remove();
  const body = content.text().replace(/\s+/g, " ").trim();
  return body.length >= 250 && /[가-힣]/.test(body) ? body.slice(0, 20000) : null;
}
export const { scrapeAndInsert: scrapeNamguGwangjuAndInsert } = createPressCollector({
  cityName: "광주 남구", region: "광주", ministry: "광주 남구청", sourceOutlet: "광주 남구청",
  sourceCode: "local-press-namgu-gwangju", listUrl: LIST_URL, parseListItems: parseListPage, parseDetailBody,
});
