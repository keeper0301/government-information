// ============================================================
// 인천 강화군청 보도자료 수집 (2026-05-28)
// ============================================================
// 강화군은 인천 여러 자치구와 같은 bbsMsgDetail 방식을 씁니다.
// 공통 도우미에 주소와 기관명만 넘겨서 중복 코드를 만들지 않습니다.
// ============================================================

import { createBbsMsgDetailCollector } from "./_bbs_msg_detail_helper";

export const { scrapeAndInsert: scrapeGanghwaAndInsert } =
  createBbsMsgDetailCollector({
    baseUrl: "https://www.ganghwa.go.kr",
    listPath: "/open_content/main/bbs/bbsMsgList.do?bcd=report",
    detailBasePath: "/open_content/main/bbs",
    cityName: "강화군",
    region: "인천",
    ministry: "강화군청",
    sourceCode: "local-press-ganghwa",
  });
