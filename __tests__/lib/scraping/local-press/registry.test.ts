import { describe, expect, it } from "vitest";
import { CITY_BY_KEY } from "@/lib/scraping/local-press/_registry";

describe("지역 언론 수집기 등록부", () => {
  it("인천 중구는 static cron 목록에서 제외하고, 강화군/인천 동구를 관리자 실행 목록에 노출한다", () => {
    // 2026-07-22: 인천 중구 krop0231c 는 public 검색 결과는 살아있지만,
    // Vercel/static fetch 에서는 /index.html shell 로 떨어져 fetched=0만 만든다.
    // PC/Playwright 전용 복구 전까지 static stale health target 에서 제외한다.
    expect("junggu_incheon" in CITY_BY_KEY).toBe(false);
    expect(CITY_BY_KEY.ganghwa).toMatchObject({
      city: "강화군",
      ministry: "강화군청",
      siteUrl:
        "https://www.ganghwa.go.kr/open_content/main/bbs/bbsMsgList.do?bcd=report",
    });
    expect(CITY_BY_KEY.donggu_incheon).toMatchObject({
      city: "인천 동구",
      ministry: "인천 동구청",
      siteUrl: "https://www.icdonggu.go.kr/main/bbs/bbsMsgList.do?bcd=press",
    });
  });
});
