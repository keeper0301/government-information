// ============================================================
// 광주 서구청 보도자료 수집 (2026-05-26 helper 으로 refactor)
// ============================================================
// 광주 서구 인구 30만. board.es CMS (mid=c50501000000&bid=0154).
// title attribute 없음 — inner text 전략.
// ============================================================

import { createBoardEsCollector } from "./_board_es_helper";

export const { scrapeAndInsert: scrapeSeoguGwangjuAndInsert } =
  createBoardEsCollector({
    baseUrl: "https://www.seogu.gwangju.kr",
    mid: "c50501000000",
    bid: "0154",
    cityName: "광주 서구",
    region: "광주",
    ministry: "광주 서구청",
    sourceCode: "local-press-seogu-gwangju",
    titleStrategy: "inner",
  });
