import { afterEach, describe, expect, it, vi } from "vitest";
import { collectKoreaKr, inspectKoreaKrRecent } from "@/lib/news-collectors/korea-kr";

describe("korea.kr RSS discontinued handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("inspectKoreaKrRecent 는 원본 RSS probe 를 실패로 세지 않는다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await inspectKoreaKrRecent(new Date("2026-06-27T02:00:00Z"));

    expect(result.errors).toBe(0);
    expect(result.total).toBe(0);
    expect(result.recent).toBe(0);
    expect(result.latestPublishedAt).toBeNull();
    expect(result.discontinued).toBe(true);
    expect(result.discontinuedAt).toBe("2026-07-01");
    expect(result.reason).toContain("RSS service discontinued");
    expect(result.breakdown["korea-kr-dept-molit"]).toEqual({ total: 0, recent: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("collectKoreaKr 도 RSS 중단을 정상 no-op 으로 반환한다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await collectKoreaKr();

    expect(result.errors).toBe(0);
    expect(result.total).toBe(0);
    expect(result.upserted).toBe(0);
    expect(result.discontinued).toBe(true);
    expect(result.errorDetails).toEqual({});
    expect(result.breakdown["korea-kr-dept-mw"]).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
