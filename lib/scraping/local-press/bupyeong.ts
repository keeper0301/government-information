// ============================================================
// 인천 부평구청 보도자료 수집 (2026-05-26 helper refactor)
// ============================================================
// 인천 부평구 인구 47만. bbsMsgDetail CMS (open_content 없는 base path).
// list 경로 `/main/participation/news/report.jsp` (5/22 batch 확정).
// ============================================================

import { createBbsMsgDetailCollector } from "./_bbs_msg_detail_helper";

export const { scrapeAndInsert: scrapeBupyeongAndInsert } =
  createBbsMsgDetailCollector({
    baseUrl: "https://www.icbp.go.kr",
    listPath: "/main/participation/news/report.jsp",
    detailBasePath: "/main/bbs",
    cityName: "부평구",
    region: "인천",
    ministry: "부평구청",
    sourceCode: "local-press-bupyeong",
  });
