// 양산시 공식 보도자료: 글별 날짜와 본문 영역을 구분하여 수집합니다.
import { load } from "cheerio";
import { createPressCollector, type PressNewsItem } from "./_factory";

export const LIST_URL = "https://www.yangsan.go.kr/portal/contents.do?mid=0105010000";

export function parseListPage(html: string): PressNewsItem[] {
  const $ = load(html);
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  $("a[data-action=\"/portal/saeol/news/view.do\"]").each((_, element) => {
    const link = $(element);
    const row = link.closest("tr, li");
    if (row.find(".notice").length) return;
    // 화면은 POST 버튼이지만 공식 상세 주소는 같은 번호의 GET 조회도 지원합니다.
    const seq = link.attr("data-keyset")?.match(/newsEpctNo[^\d]+(\d+)/)?.[1];
    if (!seq) return;
    const sourceUrl = new URL("/portal/saeol/news/view.do", LIST_URL);
    sourceUrl.searchParams.set("mid", "0105010000");
    sourceUrl.searchParams.set("newsEpctNo", seq);
    const titleNode = link .clone();
    titleNode.find("i, img, em, .new, .wrap1ics2").remove();
    const title = titleNode.text().replace(/\s+/g, " ").trim();
    if (title.length < 5 || seen.has(seq)) return;
    // 날짜는 이 글의 날짜 칸에서만 찾아 다른 글이나 메뉴 날짜가 섞이지 않게 합니다.
    const dateText = row.find("td").toArray()
      .map((cell) => $(cell).text().trim())
      .find((text) => /^(?:등록일\s*:\s*)?(?:\d{4}|\d{2})[-.]\d{2}[-.]\d{2}\.?$/.test(text)) ?? "";
    const date = dateText.match(/(\d{4}|\d{2})[-.](\d{2})[-.](\d{2})/);
    const publishedDate = date ? `${date[1].length === 2 ? "20" + date[1] : date[1]}-${date[2]}-${date[3]}` : null;
    seen.add(seq);
    items.push({ seq, title, publishedDate, sourceUrl: sourceUrl.href });
  });
  return items;
}

export function parseDetailBody(html: string): string | null {
  const $ = load(html);
  // 기사 전용 영역만 읽으며 사진 슬라이더와 스크립트는 제거합니다.
  const body = $(".bod_view .view_cont").first().clone();
  if (!body.length) return null;
  body.find("script, style, .pic1gallery1, .attach1, .hwp_editor_board_content").remove();
  body.find("br").replaceWith("\n");
  body.find("p").append("\n");
  const text = body.text().replace(/\r/g, "").replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n").trim();
  return text.length >= 250 && /[가-힣]/.test(text) ? text.slice(0, 20000) : null;
}

export const { scrapeAndInsert: scrapeYangsanAndInsert } = createPressCollector({
  cityName: "양산시", region: "경남", ministry: "양산시청",
  sourceOutlet: "양산시청", sourceCode: "local-press-yangsan",
  listUrl: LIST_URL, parseListItems: parseListPage, parseDetailBody,
});
