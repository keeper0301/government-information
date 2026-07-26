// ============================================================
// 부산 해운대구 보도/해명 수집 — eminwon 전용 (POST 기반)
// ============================================================
// 공식 페이지: /index.do?menuCd=DOM_000000104001003001
// iframe: https://eminwon.haeundae.go.kr/emwp/jsp/ofr/OfrNewsEpctLMiniSub.jsp?news_epct_yn=1,2
// POST action: https://eminwon.haeundae.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do
// 최신 여러 페이지가 빈 본문인 사진/단신 위주라 여러 페이지를 스캔한다.
// ============================================================

import {
  createEminwonScraper,
  parseEminwonDetailBody,
  parseEminwonListItems,
} from "./_eminwon_helper";

// 단위 테스트 호환 re-export.
export const parseListItems = parseEminwonListItems;
export const parseDetailBody = parseEminwonDetailBody;

export const { scrapeAndInsert: scrapeHaeundaeEminwonAndInsert } =
  createEminwonScraper({
    actionUrl:
      "https://eminwon.haeundae.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do",
    ministry: "부산 해운대구청",
    sourceOutlet: "부산 해운대구청",
    sourceCode: "local-press-haeundae",
    cityKey: "haeundae",
    cityName: "부산 해운대구",
    newsEpctYn: "1,2",
    title: "보도자료",
    listPages: 5,
  });
