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
  });
