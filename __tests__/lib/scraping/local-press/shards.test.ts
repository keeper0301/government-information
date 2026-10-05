import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { selectPressShard, LOCAL_PRESS_SHARD_COUNT } from "@/lib/scraping/local-press/_shards";

describe("전국 수집 묶음", () => {
  it("최대 240개 수집처가 중복이나 누락 없이 매일 한 번씩 배정된다", () => {
    const entries = Array.from({ length: 240 }, (_, index) => index);
    const groups = Array.from({ length: LOCAL_PRESS_SHARD_COUNT }, (_, index) => selectPressShard(entries, String(index)));
    expect(groups.flat().sort((a, b) => a - b)).toEqual(entries);
    expect(new Set(groups.flat()).size).toBe(entries.length);
    // 도시당 90초 상한을 적용해도 일곱 묶음으로 700초 예산 안에 들어온다.
    expect(groups.every((group) => Math.ceil(group.length / 6) * 90000 < 700000)).toBe(true);
  });
  it.each(["", "-1", "6", "1.5", "0abc"])("잘못된 묶음 번호 %s를 차단한다", (value) => {
    expect(() => selectPressShard([1, 2], value)).toThrow();
  });
  it("배포 설정이 여섯 묶음을 각각 하루 한 번 실행한다", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    const crons = config.crons.filter((cron: { path: string }) => cron.path.startsWith("/api/cron/scrape-local-press"));
    expect(crons.map((cron: { path: string }) => cron.path)).toEqual(Array.from({ length: 6 }, (_, index) => `/api/cron/scrape-local-press?shard=${index}`));
  });
});
