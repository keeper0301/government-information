// ============================================================
// 광주 북구청 보도자료 수집 (2026-05-26 helper 으로 refactor)
// ============================================================
// 광주 북구 인구 41만. board.es CMS (mid=a10402010000&bid=0001).
// title attribute 전략.
// ============================================================

import { createBoardEsCollector } from "./_board_es_helper";

export const { scrapeAndInsert: scrapeBukguGwangjuAndInsert } =
  createBoardEsCollector({
    baseUrl: "https://bukgu.gwangju.kr",
    mid: "a10402010000",
    bid: "0001",
    cityName: "광주 북구",
    region: "광주",
    ministry: "광주 북구청",
    sourceCode: "local-press-bukgu-gwangju",
    titleStrategy: "attr",
  });
