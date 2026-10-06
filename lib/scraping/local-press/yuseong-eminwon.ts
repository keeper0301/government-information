// 현재 공식 게시판을 사용합니다. 옛 새올 게시판은 2014년 자료만 남아 있습니다.
import { load } from "cheerio";
import { createPressCollector, type PressNewsItem } from "./_factory";

export const LIST_URL = "https://www.yuseong.go.kr/bbs/BBSMSTR_000000000103/list.do";

export function parseListItems(html: string): PressNewsItem[] {
  const $ = load(html), items: PressNewsItem[] = [], seen = new Set<string>();
  $("tr").each((_, row) => {
    const link = $(row).find("a[onclick*=fn_search_detail]").first();
    const seq = link.attr("onclick")?.match(/fn_search_detail\('([A-Za-z0-9]+)'\)/)?.[1];
    const title = link.text().replace(/\s+/g, " ").trim();
    const date = $(row).find(".regDate").text().trim();
    if (!seq || seen.has(seq) || !/[가-힣]/.test(title)) return;
    seen.add(seq);
    items.push({ seq, title, publishedDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      sourceUrl: `https://www.yuseong.go.kr/bbs/BBSMSTR_000000000103/view.do?nttId=${seq}` });
  });
  return items;
}

export function parseDetailBody(html: string): string | null {
  const $ = load(html), content = $(".bbs--view--content").first();
  content.find("script, style, iframe, noscript").remove();
  const body = content.text().replace(/\s+/g, " ").trim();
  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

// 기존 호출 이름을 유지하고 같은 지역을 중복 등록하지 않습니다.
export const { scrapeAndInsert: scrapeYuseongEminwonAndInsert } = createPressCollector({
  cityName: "대전 유성구", region: "대전", ministry: "대전 유성구청",
  sourceOutlet: "대전 유성구청", sourceCode: "local-press-yuseong",
  listUrl: LIST_URL, parseListItems, parseDetailBody,
});
