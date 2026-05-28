// ============================================================
// 인천 동구청 보도자료 수집 (2026-05-28)
// ============================================================
// 동구청은 bbsMsgDetail 방식을 쓰지만 게시판 코드가 report가 아니라 press입니다.
// 공통 도우미의 bcd 선택값만 바꿔 같은 방식으로 수집합니다.
// ============================================================

import { createBbsMsgDetailCollector } from "./_bbs_msg_detail_helper";

export const { scrapeAndInsert: scrapeDongguIncheonAndInsert } =
  createBbsMsgDetailCollector({
    baseUrl: "https://www.icdonggu.go.kr",
    listPath: "/main/bbs/bbsMsgList.do?bcd=press",
    detailBasePath: "/main/bbs",
    cityName: "인천 동구",
    region: "인천",
    ministry: "인천 동구청",
    sourceCode: "local-press-donggu-incheon",
    bcd: "press",
  });
