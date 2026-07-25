// ============================================================
// 부산 중구 보도/해명 수집 — eminwon 전용 (POST 기반)
// ============================================================
// 공식 페이지: /index.junggu?menuCd=DOM_000000103001004000
// 실제 목록/상세는 iframe 내 eminwon POST 기반이다.
//   https://eminwon.bsjunggu.go.kr/emwp/jsp/ofr/OfrNewsEpctLSub.jsp?homepagetype=new
//   /emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do

import {
  createEminwonScraper,
  parseEminwonDetailBody,
  parseEminwonListItems,
} from "./_eminwon_helper";

export const parseListItems = parseEminwonListItems;
export const parseDetailBody = parseEminwonDetailBody;

export const { scrapeAndInsert: scrapeBsjungguEminwonAndInsert } =
  createEminwonScraper({
    actionUrl:
      "https://eminwon.bsjunggu.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do",
    ministry: "부산 중구청",
    sourceOutlet: "부산 중구청",
    sourceCode: "local-press-bsjunggu",
    cityKey: "bsjunggu",
    cityName: "부산 중구",
  });
