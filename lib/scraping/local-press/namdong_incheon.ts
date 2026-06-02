// ============================================================
// 인천 남동구청 보도자료 수집 (2026-05-26 helper refactor)
// ============================================================
// 인천 남동구 인구 50만. bbsMsgDetail CMS (open_content 없는 base path).
// 도메인 namdong.go.kr (subdomain X).
// ============================================================

import { createBbsMsgDetailCollector } from "./_bbs_msg_detail_helper";

// parseListItems/parseDetailBody 도 export — namdong 은 prod(Vercel) 403 IP 차단이라
// PC runner(가정용 IP) 경로(_pc_runner_cfgs)에서 정적 parser 재사용.
export const {
  scrapeAndInsert: scrapeNamdongIncheonAndInsert,
  parseListItems: parseNamdongList,
  parseDetailBody: parseNamdongDetail,
} = createBbsMsgDetailCollector({
    baseUrl: "https://www.namdong.go.kr",
    listPath: "/main/news/report.jsp",
    detailBasePath: "/main/bbs",
    cityName: "남동구",
    region: "인천",
    ministry: "남동구청",
    sourceCode: "local-press-namdong",
    // 2026-06-02 — 보도자료 게시판 bcd 가 기본 "report" 가 아니라 "press_release".
    // (TLS 체인 누락으로 fetch 자체가 막혀있던 것은 factory TLS 완화로 해소.)
    bcd: "press_release",
  });
