// ============================================================
// 부산 남구 보도자료 수집 — eminwon 전용 (POST 기반)
// ============================================================
// 공식 페이지: /index.namgu?menuCd=DOM_000000105001004000
// iframe: https://eminwon.bsnamgu.go.kr/emwp/jsp/ofr/OfrNewsEpctLSub.jsp?news_epct_no=1,2
// POST action: https://eminwon.bsnamgu.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do
// 남구는 보도/대응 범위를 news_epct_yn=1,2 로 노출한다.
// ============================================================

import {
  createEminwonScraper,
  parseEminwonDetailBody,
  parseEminwonListItems,
} from "./_eminwon_helper";

// 단위 테스트 호환 re-export.
export const parseListItems = parseEminwonListItems;
export const parseDetailBody = parseEminwonDetailBody;

export const { scrapeAndInsert: scrapeBsnamguEminwonAndInsert } =
  createEminwonScraper({
    actionUrl:
      "https://eminwon.bsnamgu.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do",
    ministry: "부산 남구청",
    sourceOutlet: "부산 남구청",
    sourceCode: "local-press-bsnamgu",
    cityKey: "bsnamgu",
    cityName: "부산 남구",
    newsEpctYn: "1,2",
    title: "보도자료",
    listPages: 4,
  });
