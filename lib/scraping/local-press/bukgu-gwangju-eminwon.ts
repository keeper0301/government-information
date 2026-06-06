// ============================================================
// 광주 북구 보도자료 수집 — eminwon 전용 (POST 기반)
// ============================================================
// 2026-06-07 — 기존 board.es 경로(mid=a10402010000&bid=0001)가 실제로는
// "평생학습 희망아카데미 강연 안내" 게시판이라 보도자료가 아니었음(누적 1건).
// 진짜 보도자료는 eminwon(OfrAction.do POST) 에 있음.
// (라이브 정찰: list 10건·searchDetail('10993')·하천방재과·최신 2026-06-07 활발)
//
// 부산 북구(bsbukgu)·기장과 동일한 OfrBcAdvNewsEJB list 규약이지만, 광주 북구
// detail 은 form1 전체 필드(subCheck=N + 빈 검색필드 4종)를 요구한다. 축약
// detailBody 로는 본문 없는 2.7KB 응답만 와서, detailBodyBuilder 로 override.
// ============================================================

import {
  createEminwonScraper,
  parseEminwonListItems,
  parseEminwonDetailBody,
} from "./_eminwon_helper";

// 단위 테스트 호환 re-export.
export const parseListItems = parseEminwonListItems;
export const parseDetailBody = parseEminwonDetailBody;

// 광주 북구 detail POST body — 브라우저 searchDetail() 이 제출하는 form1 전체 필드.
// 표준 detailBody 와 차이: subCheck=N(표준 Y), pageIndex=1(표준 빈값), 그리고
// 검색 빈 필드 4종(data_sj·cha_dep_code_nm·data_prvd_ymd_from/to) 추가. 이 필드가
// 없으면 광주 북구 eminwon 은 본문을 안 내려준다(라이브 검증: 누락 2.7KB → 전체 7.7KB).
export function buildBukguGwangjuDetailBody(newsEpctNo: string): string {
  const p = new URLSearchParams();
  p.set("pageIndex", "1");
  p.set("jndinm", "OfrBcAdvNewsEJB");
  p.set("context", "NTIS");
  p.set("method", "selectOfrNews");
  p.set("methodnm", "selectOfrNewsMgt");
  p.set("news_epct_no", newsEpctNo);
  p.set("subCheck", "N");
  p.set("ofr_pageSize", "10");
  p.set("news_epct_yn", "1");
  p.set("title", "보도자료");
  p.set("data_open_yn", "1");
  p.set("initValue", "Y");
  p.set("countYn", "Y");
  p.set("data_sj", "");
  p.set("cha_dep_code_nm", "");
  p.set("data_prvd_ymd_from", "");
  p.set("data_prvd_ymd_to", "");
  return p.toString();
}

export const { scrapeAndInsert: scrapeBukguGwangjuEminwonAndInsert } =
  createEminwonScraper({
    actionUrl:
      "https://eminwon.bukgu.gwangju.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do",
    ministry: "광주 북구청",
    sourceOutlet: "광주 북구청",
    sourceCode: "local-press-bukgu-gwangju",
    cityKey: "bukgu-gwangju",
    cityName: "광주 북구",
    detailBodyBuilder: buildBukguGwangjuDetailBody,
  });
