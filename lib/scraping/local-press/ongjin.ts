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
    // 2026-06-02 — detail 은 open_content base path + bcd 가 "notice" (기본 report 아님).
    // list anchor 는 bcd 가 msg_seq 앞에 오는데 helper lookahead 가 순서 무관 매칭.
    // (TLS 체인 누락 fetch 실패는 factory TLS 완화로 해소.)
    detailBasePath: "/open_content/main/bbs",
    cityName: "옹진군",
    region: "인천",
    ministry: "옹진군청",
    sourceCode: "local-press-ongjin",
    bcd: "notice",
  });
