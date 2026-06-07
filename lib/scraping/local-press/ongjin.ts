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
    // 2026-06-07 — 사이트 개편으로 구 list 경로(/main/community/notify/report.jsp)가
    // 302 redirect → 메인(/open_content/main)으로 날아가 06-02 이후 0건. 신규 보도/해명
    // 게시판 경로로 교체. bcd 도 "notice" → "report"(실제 보도자료)로 정정.
    // (라이브 검증: list 10건·최신 2026-06-05·본문 board_view 정상.)
    listPath: "/open_content/main/community/board/report.jsp",
    // list anchor 는 bcd 가 msg_seq 앞에 오는데 helper lookahead 가 순서 무관 매칭.
    // (TLS 체인 누락 fetch 실패는 factory TLS 완화로 해소.)
    detailBasePath: "/open_content/main/bbs",
    cityName: "옹진군",
    region: "인천",
    ministry: "옹진군청",
    sourceCode: "local-press-ongjin",
    bcd: "report",
  });
