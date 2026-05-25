// ============================================================
// 인천 서구청 보도자료 수집 (2026-05-26 helper refactor)
// ============================================================
// 인천 서구 인구 56만. bbsMsgDetail CMS (open_content base path).
// ============================================================

import { createBbsMsgDetailCollector } from "./_bbs_msg_detail_helper";

export const { scrapeAndInsert: scrapeSeoIncheonAndInsert } =
  createBbsMsgDetailCollector({
    baseUrl: "https://www.seo.incheon.kr",
    listPath: "/open_content/main/community/news/report.jsp",
    detailBasePath: "/open_content/main/bbs",
    cityName: "인천 서구",
    region: "인천",
    ministry: "인천 서구청",
    sourceCode: "local-press-seo-incheon",
  });
