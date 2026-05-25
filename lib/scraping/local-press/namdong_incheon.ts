// ============================================================
// 인천 남동구청 보도자료 수집 (2026-05-26 helper refactor)
// ============================================================
// 인천 남동구 인구 50만. bbsMsgDetail CMS (open_content 없는 base path).
// 도메인 namdong.go.kr (subdomain X).
// ============================================================

import { createBbsMsgDetailCollector } from "./_bbs_msg_detail_helper";

export const { scrapeAndInsert: scrapeNamdongIncheonAndInsert } =
  createBbsMsgDetailCollector({
    baseUrl: "https://www.namdong.go.kr",
    listPath: "/main/news/report.jsp",
    detailBasePath: "/main/bbs",
    cityName: "남동구",
    region: "인천",
    ministry: "남동구청",
    sourceCode: "local-press-namdong",
  });
