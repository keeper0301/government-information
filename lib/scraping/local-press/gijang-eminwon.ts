// ============================================================
// 기장군 보도자료 수집 — eminwon 전용 (POST 기반)
// ============================================================
// 공통 로직(POST list/detail·parser·insert)은 _eminwon_helper.ts 로 추출(2026-06-01).
// 부산 북구 등 다른 eminwon 자치구와 공용. 여기는 기장 config 만 정의.
//
// 2026-05-30 정찰: list jndinm=OfrBcAdvNewsEJB·method=selectListOfrNews,
//   detail method=selectOfrNews·news_epct_no, list onclick searchDetail('NNNN').
// ============================================================

import {
  createEminwonScraper,
  parseEminwonListItems,
  parseEminwonDetailBody,
} from "./_eminwon_helper";

// 단위 테스트 호환 re-export (gijang-eminwon.test.ts 가 직접 import).
export const parseListItems = parseEminwonListItems;
export const parseDetailBody = parseEminwonDetailBody;

export const { scrapeAndInsert: scrapeGijangEminwonAndInsert } =
  createEminwonScraper({
    actionUrl:
      "https://eminwon.gijang.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do",
    ministry: "기장군청",
    sourceOutlet: "기장군청",
    sourceCode: "local-press-gijang",
    cityKey: "gijang",
    cityName: "기장군",
  });
