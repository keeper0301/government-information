// ============================================================
// 인천 옹진군청 보도자료 수집 (2026-05-27)
// ============================================================
// 옹진군 인구 2만. 인천 자치구 동일 bbsMsgDetail CMS.
// list 경로 `/main/community/notify/report.jsp` (inchhttps 도메인 보호 X).
// ============================================================

import { createBbsMsgDetailCollector } from "./_bbs_msg_detail_helper";

export const { scrapeAndInsert: scrapeOngjinAndInsert } =
  createBbsMsgDetailCollector({
    baseUrl: "https://www.ongjin.go.kr",
    listPath: "/main/community/notify/report.jsp",
    detailBasePath: "/main/bbs",
    cityName: "옹진군",
    region: "인천",
    ministry: "옹진군청",
    sourceCode: "local-press-ongjin",
  });
