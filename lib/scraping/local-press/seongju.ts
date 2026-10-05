// 경북 성주군 공식 자료를 가져옵니다. 메뉴와 첨부 목록은 본문에 섞지 않습니다.
import { load } from "cheerio";
import { createPressCollector, type PressNewsItem } from "./_factory";
import { fetchSiAttachBody } from "./_si_attach_helper";

export const LIST_URL = "https://www.sj.go.kr/page.do?mnu_uid=3546";

// 각 글이 속한 행 안에서 날짜를 찾아 다른 글의 날짜가 섞이지 않게 합니다.
export function parseListPage(html: string): PressNewsItem[] {
  const $ = load(html);
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  $("a[href*=\"bod_uid=\"]").each((_, element) => {
    const link = $(element);
    const seq = /[?&]bod_uid=(\d+)/.exec(link.attr("href") ?? "")?.[1];
    if (!seq || seen.has(seq)) return;
    const row = link.closest("tr, li, .card, .galleryList");
    const title = (link.attr("title") || link.text()).replace(/\s+/g, " ").trim();
    const dateText = row.find(".date").first().text() || row.text();
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

export async function parseDetailBody(html: string): Promise<string | null> {
  const $ = load(html);
  const content = $(".view_cont").first().clone();
  content.find("script, style, .file_area, .attach, .view_next").remove();
  content.find("br").replaceWith("\n");
  content.find("p, div").append("\n");
  const body = content.text().replace(/[ \t\r\u00a0]+/g, " ").replace(/\n\s*/g, "\n").trim();
  if (body.length >= 250 && /[가-힣]/.test(body)) return body.slice(0, 20000);
  // 공개 상세 페이지를 먼저 열어 받은 세션을 첨부 요청에 이어 줍니다.
  // 로그인 권한을 얻는 과정이 아니라, 공개 파일 조회 상태를 유지하는 과정입니다.
  const seq = $("input[name=bod_uid]").attr("value");
  if (!seq || !$("a[href*=board_download]").length) return null;
  const detailUrl = LIST_URL + "&bod_uid=" + seq + "&cmd=258";
  const response = await fetch(detailUrl, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) return null;
  await response.text();
  const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  return fetchSiAttachBody(html, LIST_URL, { Cookie: cookie, Referer: detailUrl });
}

const collector = createPressCollector({
  cityName: "경북 성주군", region: "경북", ministry: "경북 성주군청",
  sourceOutlet: "경북 성주군청", sourceCode: "local-press-seongju",
  listUrl: LIST_URL, parseListItems: parseListPage, parseDetailBody,
});
export const scrapeSeongjuAndInsert = collector.scrapeAndInsert;
