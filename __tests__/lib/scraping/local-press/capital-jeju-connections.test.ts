import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 공식 게시판의 구조를 짧은 합성 문장으로 재현합니다.
const regions = ["jungnang", "gangbuk", "uijeongbu", "jejusi", "seogwipo"] as const;
const exportNames = ["Jungnang", "Gangbuk", "Uijeongbu", "Jejusi", "Seogwipo"];
for (const [index, region] of regions.entries()) {
  describe(`${region} 보도자료 연결`, () => {
    const fixture = JSON.parse(readFileSync(`__tests__/lib/scraping/local-press/fixtures/${region}-20261006.json`, "utf8"));
    const getModule = async () => ({jungnang: await import("@/lib/scraping/local-press/jungnang"), gangbuk: await import("@/lib/scraping/local-press/gangbuk"), uijeongbu: await import("@/lib/scraping/local-press/uijeongbu"), jejusi: await import("@/lib/scraping/local-press/jejusi"), seogwipo: await import("@/lib/scraping/local-press/seogwipo")})[region];
    it("재현 글의 제목·같은 행의 날짜·공식 주소를 읽는다", async () => {
      const collector = await getModule();
      expect(collector?.parseListPage).toBeTypeOf("function");
      const items = collector!.parseListPage(fixture.list);
      expect(items).toHaveLength(3);
      expect(items[0].publishedDate).toBe("2026-10-02");
      expect(items[0].sourceUrl).toMatch(/^https:\/\//);
      expect(Reflect.get(collector!, `scrape${exportNames[index]}AndInsert`)).toBeTypeOf("function");
    });
    it("다음 행의 날짜를 앞 글에 붙이지 않는다", async () => {
      const collector = await getModule();
      expect(collector?.parseListPage).toBeTypeOf("function");
      const withoutDates = fixture.list.replace(/2026[.-]10[.-]02/g, "날짜 미기록");
      const items = collector!.parseListPage(withoutDates + fixture.list);
      expect(items[0].publishedDate).toBeNull();
    });
    it("재현 본문은 250자 이상이며 화면 잡음을 저장하지 않는다", async () => {
      const collector = await getModule();
      expect(collector?.parseDetailBody).toBeTypeOf("function");
      const body = await collector!.parseDetailBody(fixture.detail);
      expect(body?.length).toBeGreaterThanOrEqual(250);
      expect(body?.length).toBeLessThanOrEqual(20000);
      const dirty = fixture.detail.replace(/(<[^>]+>)/, "$1<script>실행잡음</script><style>스타일잡음</style><iframe>미리보기잡음</iframe>");
      expect(await collector!.parseDetailBody(dirty)).not.toMatch(/실행잡음|스타일잡음|미리보기잡음/);
      expect(await collector!.parseDetailBody("<main>잘못된 접근입니다.</main>")).toBeNull();
    });
  });
}


