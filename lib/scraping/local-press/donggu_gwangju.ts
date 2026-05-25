// ============================================================
// 광주 동구청 보도자료 수집 (2026-05-26 helper 으로 refactor)
// ============================================================
// 광주 동구 인구 9만. board.es CMS (mid=a10402010000&bid=0001, 북구와 동일).
// 도메인 donggu.kr (subdomain 없음, 다른 광주 자치구와 차이).
// inner text 전략.
// ============================================================

import { createBoardEsCollector } from "./_board_es_helper";

export const { scrapeAndInsert: scrapeDongguGwangjuAndInsert } =
  createBoardEsCollector({
    baseUrl: "https://www.donggu.kr",
    mid: "a10402010000",
    bid: "0001",
    cityName: "광주 동구",
    region: "광주",
    ministry: "광주 동구청",
    sourceCode: "local-press-donggu-gwangju",
    titleStrategy: "inner",
  });
