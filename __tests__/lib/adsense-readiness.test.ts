import { describe, expect, it, vi, afterEach } from "vitest";
import { isAdsenseContentReady } from "@/lib/adsense-readiness";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("AdSense 콘텐츠 전환 준비", () => {
  it.each([
    [0.8, 0.6, false],
    [1, 37443 / 56100, false],
    [0.8, 0.59, true],
    [0.85, 0.3, true],
    [0.79, 0.3, false],
    [0, 0, false],
    [0.85, Number.NaN, false],
  ])("백필 %s / news %s → %s", (backfill, news, ready) => {
    expect(isAdsenseContentReady(backfill, news)).toBe(ready);
  });
  it("설정된 news 경고 임계치와 OFF 기준이 일치", async () => {
    vi.stubEnv("NEWS_RATIO_HIGH_FLOOR", "0.5");
    vi.resetModules();
    const { isAdsenseContentReady: ready } = await import("@/lib/adsense-readiness");
    expect(ready(0.8, 0.5)).toBe(false);
    expect(ready(0.8, 0.49)).toBe(true);
  });
  it("잘못된 임계치 설정은 기본 60%로 복귀", async () => {
    vi.stubEnv("NEWS_RATIO_HIGH_FLOOR", "invalid");
    vi.resetModules();
    const { isAdsenseContentReady: ready } = await import("@/lib/adsense-readiness");
    expect(ready(0.8, 0.6)).toBe(false);
    expect(ready(0.8, 0.59)).toBe(true);
  });
});
