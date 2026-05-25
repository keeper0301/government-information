// ============================================================
// 광주 남구청 보도자료 수집 (2026-05-26 helper 으로 refactor)
// ============================================================
// 광주 남구 인구 21만. board.es CMS (mid=a10707060200&bid=0001).
// title attribute 사용 (안 nested img + plain text 안전).
// ============================================================

import { createBoardEsCollector } from "./_board_es_helper";

export const { scrapeAndInsert: scrapeNamguGwangjuAndInsert } =
  createBoardEsCollector({
    baseUrl: "https://www.namgu.gwangju.kr",
    mid: "a10707060200",
    bid: "0001",
    cityName: "광주 남구",
    region: "광주",
    ministry: "광주 남구청",
    sourceCode: "local-press-namgu-gwangju",
    titleStrategy: "attr",
  });
