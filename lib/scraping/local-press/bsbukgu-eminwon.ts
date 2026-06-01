// ============================================================
// 부산 북구 보도자료 수집 — eminwon 전용 (POST 기반)
// ============================================================
// 2026-06-01 — 기존 proxy 경로(playwright)가 BBS_0000012=공동주택 관리(건축과)
// 오등록이라 보도자료 0건이었음. 진짜 보도자료는 eminwon(OfrAction.do POST).
// 부산북구 form1 필드가 기장과 동일 확인(jndinm=OfrBcAdvNewsEJB·title=보도자료) →
// 공통 _eminwon_helper.ts 재사용, 여기는 북구 config 만.
// (라이브 정찰: list 10건·searchDetail('11809')·미래전략과·최신 2026-05-22 활발)
// ============================================================

import {
  createEminwonScraper,
  parseEminwonListItems,
  parseEminwonDetailBody,
} from "./_eminwon_helper";

// 단위 테스트 호환 re-export.
export const parseListItems = parseEminwonListItems;
export const parseDetailBody = parseEminwonDetailBody;

export const { scrapeAndInsert: scrapeBsbukguEminwonAndInsert } =
  createEminwonScraper({
    actionUrl:
      "https://eminwon.bsbukgu.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do",
    ministry: "부산 북구청",
    sourceOutlet: "부산 북구청",
    sourceCode: "local-press-bsbukgu",
    cityKey: "bsbukgu",
    cityName: "부산 북구",
  });
