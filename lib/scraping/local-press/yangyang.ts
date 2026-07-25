// ============================================================
// 강원특별자치도 양양군청 보도자료 수집 (2026-07-25)
// ============================================================
// 공식 보도자료: /gw/portal/yyc_news_report
// 실제 목록/상세: eminwon iframe POST 기반
//   /emwp/jsp/ofr/OfrNewsEpctLSub.jsp?news_epct_yn=1
//   /emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do
// 공통 _eminwon_helper.ts 재사용.

import {
  createEminwonScraper,
  parseEminwonDetailBody,
  parseEminwonListItems,
} from "./_eminwon_helper";

export const parseListItems = parseEminwonListItems;
export const parseDetailBody = parseEminwonDetailBody;

export const { scrapeAndInsert: scrapeYangyangAndInsert } = createEminwonScraper({
  actionUrl:
    "https://eminwon.yangyang.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do",
  ministry: "강원특별자치도 양양군청",
  sourceOutlet: "강원특별자치도 양양군청",
  sourceCode: "local-press-yangyang",
  cityKey: "yangyang",
  cityName: "양양군",
});
