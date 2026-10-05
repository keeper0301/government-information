// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fetchPage } from "@/lib/scraping/local-press/_factory";
const cities = ["mungyeong", "gyeongsan", "uiseong", "cheongsong", "yeongyang", "yeongdeok", "cheongdo", "goryeong", "seongju", "chilgok", "yecheon", "bonghwa", "ulleung", "uljin"];
// 평소 검사에서는 외부망을 호출하지 않습니다. 필요한 경우에만 명시적으로 실행합니다.
describe.skipIf(process.env.LOCAL_PRESS_LIVE_CHECK !== "1")("경북 공식 사이트 실제 연결", () => {
  for (const city of cities) {
    it(`${city}의 최근 세 글 중 저장 가능한 전문을 확보한다`, async () => {
      const collector = await import(`@/lib/scraping/local-press/${city}.ts`);
      const list = collector.parseListPage(await fetchPage(collector.LIST_URL));
      expect(list.length).toBeGreaterThan(0);
      let collected = 0;
      for (const item of list.slice(0, 3)) {
        const body = await collector.parseDetailBody(await fetchPage(item.sourceUrl));
        if (body && body.length >= 250) collected += 1;
      }
      expect(collected).toBeGreaterThan(0);
    }, 180000);
  }
});
