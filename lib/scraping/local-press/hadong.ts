// 하동군 공식 보도자료: 글별 날짜와 본문 영역을 구분하여 수집합니다.
import { load } from "cheerio";
import { createPressCollector, type PressNewsItem } from "./_factory";

export const LIST_URL = "https://www.hadong.go.kr/media/00013/03607.web";

export function parseListPage(html: string): PressNewsItem[] {
  const $ = load(html);
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  $("a[href*=\"gcode=4085\"][href*=\"amode=view\"]").each((_, element) => {
    const link = $(element);
    const row = link.closest("tr, li");
    if (row.find(".notice").length) return;
    const href = link.attr("href")?.replace(/;jsessionid=[^?]+/i, "");
    if (!href) return;
    const sourceUrl = new URL(href, LIST_URL);
    const seq = sourceUrl.searchParams.get("idx");
    if (!seq) return;
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
  const body = $(".substanceautolink").first().length
    ? $(".substanceautolink").first().clone()
    : $(".substance").first().clone();
  if (!body.length) return null;
  body.find("script, style, .pic1gallery1, .attach1, .hwp_editor_board_content").remove();
  body.find("br").replaceWith("\n");
  body.find("p").append("\n");
  const text = body.text().replace(/\r/g, "").replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n").trim();
  return text.length >= 250 && /[가-힣]/.test(text) ? text.slice(0, 20000) : null;
}

export const { scrapeAndInsert: scrapeHadongAndInsert } = createPressCollector({
  cityName: "하동군", region: "경남", ministry: "하동군청",
  sourceOutlet: "하동군청", sourceCode: "local-press-hadong",
  listUrl: LIST_URL, parseListItems: parseListPage, parseDetailBody,
});
