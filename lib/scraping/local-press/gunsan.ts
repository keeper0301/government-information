// ============================================================
// 전북특별자치도 군산시청 보도자료 수집 (2026-07-25)
// ============================================================
// 공식 메뉴는 군산시 대표 페이지의 시정알림 > 보도자료.
// 실제 보도/대응자료 목록/상세는 eminwon POST 기반이다.
//   http://eminwon.gunsan.go.kr/emwp/jsp/ofr/OfrNewsEpctLSub.jsp?news_epct_yn=1,2
//   /emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do

import {
  createEminwonScraper,
  parseEminwonDetailBody,
  parseEminwonListItems,
} from "./_eminwon_helper";

export const parseListItems = parseEminwonListItems;
export const parseDetailBody = parseEminwonDetailBody;

export const { scrapeAndInsert: scrapeGunsanAndInsert } = createEminwonScraper({
  actionUrl:
    "http://eminwon.gunsan.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do",
  ministry: "전북특별자치도 군산시청",
  sourceOutlet: "전북특별자치도 군산시청",
  sourceCode: "local-press-gunsan",
  cityKey: "gunsan",
  cityName: "군산시",
  newsEpctYn: "1,2",
  title: "보도 및 대응자료",
});
