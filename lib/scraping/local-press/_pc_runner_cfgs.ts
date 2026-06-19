// ============================================================
// PC runner cfg map (2026-05-25)
// ============================================================
// PC runner HTML-업로드 엔드포인트(/api/admin/local-press/upload)가 사용하는 collector cfg.
//
// 2026-06-19 — busan·gwangsan(cron 정상 수집 중)·jeju·pyeongtaek(GHA proxy 정상) 제거.
//   이 4곳은 이미 cron/proxy 로 수집되는데 PC 업로드 경로가 중복으로 돌며 "detail HTML 누락"
//   실패(주 20/21회·insert 0~4 중복)만 내던 dead dual-path 였음(audit 노이즈+모니터링 오염).
//   정상 경로는 무영향(PC_RUNNER_CFGS 는 /upload 전용). [[feedback_dead_code_two_paths]]
//   (이전 제거: seoul→RSS, gangwon→icn1 cron)
// ============================================================

import type { PressCollectorConfig } from "./_factory";
// 2026-06-02 — 남동구: prod(Vercel) 403 IP 차단 → 가정용 IP PC runner. 정적 parser 재사용.
import { parseNamdongList, parseNamdongDetail } from "./namdong_incheon";

export const PC_RUNNER_CFGS: Record<string, PressCollectorConfig> = {
  namdong: {
    cityName: "남동구",
    region: "인천",
    ministry: "남동구청",
    sourceOutlet: "남동구청",
    sourceCode: "local-press-namdong",
    listUrl: "https://www.namdong.go.kr/main/news/report.jsp",
    parseListItems: parseNamdongList,
    parseDetailBody: parseNamdongDetail,
  },
};

export const PC_RUNNER_CITY_KEYS = Object.keys(PC_RUNNER_CFGS);
