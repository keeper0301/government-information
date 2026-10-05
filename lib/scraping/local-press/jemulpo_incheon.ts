// 인천 동구와 중구 내륙을 통합한 제물포구의 공식 보도자료를 수집한다.
import { load } from "cheerio";
import { createPressCollector } from "./_factory";
import { fetchSiAttachBody } from "./_si_attach_helper";
import { createBbsMsgDetailCollector } from "./_bbs_msg_detail_helper";

const collector = createBbsMsgDetailCollector({
  baseUrl: "https://www.jemulpo.go.kr",
  listPath: "/main/bbs/bbsMsgList.do?bcd=press",
  detailBasePath: "/main/bbs",
  cityName: "제물포구",
  region: "인천",
  ministry: "제물포구청",
  sourceCode: "local-press-jemulpo-incheon",
  bcd: "press",
});

export const parseListPage = collector.parseListItems;
// 현재 게시판의 정적 전문을 읽고 전문이 없을 때만 첨부를 확인합니다.
export async function parseDetailBody(html: string): Promise<string | null> {
  const $ = load(html), content = $(".con-box .detail").first();
  content.find("script,style,iframe,noscript").remove();
  const body = content.text().replace(/\s+/g, " ").trim();
  if (body.length >= 250 && /[가-힣]/.test(body)) return body.slice(0, 20000);
  return await fetchSiAttachBody(html, "https://www.jemulpo.go.kr/");
}
export const { scrapeAndInsert: scrapeJemulpoIncheonAndInsert } = createPressCollector({
  cityName: "제물포구", region: "인천", ministry: "제물포구청", sourceOutlet: "제물포구청",
  sourceCode: "local-press-jemulpo-incheon", listUrl: "https://www.jemulpo.go.kr/main/bbs/bbsMsgList.do?bcd=press",
  parseListItems: parseListPage, parseDetailBody,
});

