// 인천 검단구의 공식 보도자료를 공통 게시판 수집 방식으로 연결한다.
import { load } from "cheerio";
import { createPressCollector } from "./_factory";
import { fetchSiAttachBody } from "./_si_attach_helper";
import { createBbsMsgDetailCollector } from "./_bbs_msg_detail_helper";

const collector = createBbsMsgDetailCollector({
  baseUrl: "https://www.geomdan.go.kr",
  listPath: "/main/community/news/report.jsp",
  detailBasePath: "/main/bbs",
  cityName: "검단구",
  region: "인천",
  ministry: "검단구청",
  sourceCode: "local-press-geomdan-incheon",
});

export const parseListPage = collector.parseListItems;
// 현재 게시판의 정적 전문을 읽고 전문이 없을 때만 첨부를 확인합니다.
export async function parseDetailBody(html: string): Promise<string | null> {
  const $ = load(html), content = $(".con-box .detail").first();
  content.find("script,style,iframe,noscript").remove();
  const body = content.text().replace(/\s+/g, " ").trim();
  if (body.length >= 250 && /[가-힣]/.test(body)) return body.slice(0, 20000);
  return await fetchSiAttachBody(html, "https://www.geomdan.go.kr/");
}
export const { scrapeAndInsert: scrapeGeomdanIncheonAndInsert } = createPressCollector({
  cityName: "검단구", region: "인천", ministry: "검단구청", sourceOutlet: "검단구청",
  sourceCode: "local-press-geomdan-incheon", listUrl: "https://www.geomdan.go.kr/main/community/news/report.jsp",
  parseListItems: parseListPage, parseDetailBody,
});

