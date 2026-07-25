// ============================================================
// 전북특별자치도 임실군청 보도자료 수집 (2026-07-25)
// ============================================================
// 공식 보도자료: /index.imsil?menuCd=DOM_000000103002001000
// 실제 목록/상세는 iframe 내 eminwon POST 기반이다.
//   https://eminwon.imsil.go.kr/emwp/jsp/ofr/OfrNewsEpctLSub.jsp
//   /emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do

import {
  createEminwonScraper,
  parseEminwonDetailBody,
  parseEminwonListItems,
} from "./_eminwon_helper";

export const parseListItems = parseEminwonListItems;
export const parseDetailBody = parseEminwonDetailBody;

export const { scrapeAndInsert: scrapeImsilAndInsert } = createEminwonScraper({
  actionUrl:
    "https://eminwon.imsil.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do",
  ministry: "전북특별자치도 임실군청",
  sourceOutlet: "전북특별자치도 임실군청",
  sourceCode: "local-press-imsil",
  cityKey: "imsil",
  cityName: "임실군",
});
