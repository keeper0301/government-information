// 보도자료 게시판은 제목 목록만 제공하므로, 정책 전문을 제공하는 공식 공지를 가져옵니다. 메뉴와 첨부 목록은 본문에 섞지 않습니다.
import { load } from "cheerio";
import { fetchSiAttachBody } from "./_si_attach_helper";
import { createPressCollector, type PressNewsItem } from "./_factory";

export const LIST_URL = "https://www.uljin.go.kr/board/list.uljin?boardId=BBS_NOTICE_UJ&menuCd=DOM_000000103002001000";

// 각 글이 속한 행 안에서 날짜를 찾아 다른 글의 날짜가 섞이지 않게 합니다.
export function parseListPage(html: string): PressNewsItem[] {
  const $ = load(html);
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  $(".bbs_photo_list a[href*=\"BBS_NOTICE_UJ\"][href*=\"dataSid=\"], .bbs_list a[href*=\"BBS_NOTICE_UJ\"][href*=\"dataSid=\"]").each((_, element) => {
    const link = $(element);
    const seq = /[?&]dataSid=(\d+)/.exec(link.attr("href") ?? "")?.[1];
    if (!seq || seen.has(seq)) return;
    const row = link.closest("tr, li, .card, .galleryList");
    const title = (link.find("strong").text() || link.attr("title") || link.text()).replace(/\s+/g, " ").trim();
    const dateText = row.find(".info").first().text() || row.text();
    const date = /(20\d{2})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/.exec(dateText);
    if (title.length < 4 || !/[가-힣]/.test(title)) return;
    let sourceUrl = new URL(link.attr("href")!, LIST_URL).href;
    // 옛 게시판은 보기 명령 2에서 실제 본문 명령 258로 한 번 더 이동합니다.
    sourceUrl = sourceUrl.replace(/([?&])cmd=2(?=&|$)/, "$1cmd=258");
    seen.add(seq);
    items.push({ seq, title, sourceUrl, publishedDate: date ?
      date[1] + "-" + date[2].padStart(2, "0") + "-" + date[3].padStart(2, "0") : null });
  });
  // 지원사업 공지를 앞에 두어 짧은 시설 안내보다 실제 신청 자료를 우선합니다.
  return items.sort((a, b) => Number(/지원|신청|모집|보급|정책|사업/.test(b.title)) -
    Number(/지원|신청|모집|보급|정책|사업/.test(a.title)));
}

export async function parseDetailBody(html: string): Promise<string | null> {
  const $ = load(html);
  const content = $(".bbs_content").first().clone();
  content.find("script, style, .file_area, .attach, .view_next").remove();
  content.find("br").replaceWith("\n");
  content.find("p, div").append("\n");
  const body = content.text().replace(/[ \t\r\u00a0]+/g, " ").replace(/\n\s*/g, "\n").trim();
  if (body.length >= 250 && /[가-힣]/.test(body)) return body.slice(0, 20000);
  return fetchSiAttachBody(html, LIST_URL);
}

const collector = createPressCollector({
  cityName: "경북 울진군", region: "경북", ministry: "경북 울진군청",
  sourceOutlet: "경북 울진군청", sourceCode: "local-press-uljin",
  listUrl: LIST_URL, parseListItems: parseListPage, parseDetailBody,
});
export const scrapeUljinAndInsert = collector.scrapeAndInsert;
