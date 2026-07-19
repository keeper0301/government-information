// ============================================================
// 대전 유성구 보도자료 수집 — eminwon 전용 (POST 기반)
// ============================================================
// 2026-07-19 — 유성구 eminwon OfrAction.do 가 OfrBcAdvNewsEJB
// list/detail POST에서 실제 제목·등록일·본문을 반환하는 것을 확인했다.
// 기존 기장·부산북구와 같은 공통 eminwon helper를 재사용한다.
// ============================================================

import {
  createEminwonScraper,
  parseEminwonListItems,
  parseEminwonDetailBody,
} from "./_eminwon_helper";

export const parseListItems = parseEminwonListItems;
export const parseDetailBody = parseEminwonDetailBody;

export const { scrapeAndInsert: scrapeYuseongEminwonAndInsert } =
  createEminwonScraper({
    actionUrl:
      "https://eminwon.yuseong.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do",
    ministry: "대전 유성구청",
    sourceOutlet: "대전 유성구청",
    sourceCode: "local-press-yuseong",
    cityKey: "yuseong",
    cityName: "대전 유성구",
  });
