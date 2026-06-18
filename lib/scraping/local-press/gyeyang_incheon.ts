// ============================================================
// 인천 계양구청 보도자료 수집 (2026-05-26 helper refactor)
// ============================================================
// 인천 계양구 인구 30만. bbsMsgDetail CMS (open_content base path, 서구 동일).
// ============================================================

import { createBbsMsgDetailCollector } from "./_bbs_msg_detail_helper";

export const { scrapeAndInsert: scrapeGyeyangIncheonAndInsert } =
  createBbsMsgDetailCollector({
    baseUrl: "https://www.gyeyang.go.kr",
    listPath: "/open_content/main/open_info/admin/report.jsp",
    detailBasePath: "/open_content/main/bbs",
    cityName: "계양구",
    region: "인천",
    ministry: "계양구청",
    sourceCode: "local-press-gyeyang",
    // 2026-06-02 — 계양 보도자료 게시판 bcd 가 기본 "report" 가 아니라 "board_111".
    // helper 기본값 mismatch 로 list 0건이던 것 복구.
    bcd: "board_111",
  });
