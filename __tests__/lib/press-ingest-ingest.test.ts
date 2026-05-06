import { describe, expect, it } from "vitest";
import { BASE_CAP, BOOSTED_CAP, decideCap } from "@/lib/press-ingest/ingest";

describe("decideCap — 광역 보도자료 후보 동적 cap", () => {
  it("후보 0건 → BASE_CAP (30, 평소)", () => {
    expect(decideCap(0)).toBe(BASE_CAP);
    expect(BASE_CAP).toBe(30);
  });

  it("후보 30건 (경계) → BASE_CAP — cap 동일", () => {
    expect(decideCap(30)).toBe(BASE_CAP);
  });

  it("후보 31건 (적체 시작) → BOOSTED_CAP (50)", () => {
    expect(decideCap(31)).toBe(BOOSTED_CAP);
    expect(BOOSTED_CAP).toBe(50);
  });

  it("후보 200건 (probe 한계) → BOOSTED_CAP", () => {
    expect(decideCap(200)).toBe(BOOSTED_CAP);
  });
});
