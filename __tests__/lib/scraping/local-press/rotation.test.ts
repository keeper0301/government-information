// @vitest-environment node
import { describe, expect, it } from "vitest";
import { rotatePressCities } from "@/lib/scraping/local-press/_rotation";

describe("날짜별 지역 순환", () => {
  it.each([0, 1, 5, 6, 7, 12, 13, 180, 181, 185, 186, 187, 192, 193, 209])("지역 %i개에서 중복/누락 없이 모든 시작 묶음을 방문한다", (count) => {
    const entries = Array.from({ length: count }, (_, i) => i);
    const starts = new Set<number | undefined>();
    const batches = Math.max(1, Math.ceil(count / 6));
    for (let day = 0; day < batches; day++) {
      const ordered = rotatePressCities(entries, 6, day * 86_400_000);
      expect([...ordered].sort((a, b) => a - b)).toEqual(entries);
      starts.add(ordered[0]);
      expect(rotatePressCities(entries, 6, day * 86_400_000 + 86_399_999)).toEqual(ordered);
    }
    expect(starts.size).toBe(batches);
    expect(rotatePressCities(entries, 6, batches * 86_400_000)).toEqual(entries);
    expect(entries).toEqual(Array.from({ length: count }, (_, i) => i));
  });

  it("실제 일일 실행 날짜의 모든 인접 슬롯에서 120곳씩 시도하면 뒤쪽 65곳을 포함한다", () => {
    const entries = Array.from({ length: 185 }, (_, i) => i);
    const start = Date.parse("2026-09-30T00:00:00Z");
    for (let day = 0; day < 31; day++) {
      const first = rotatePressCities(entries, 6, start + day * 86_400_000).slice(0, 120);
      const second = rotatePressCities(entries, 6, start + (day + 1) * 86_400_000).slice(0, 120);
      expect(new Set([...first, ...second]).size).toBe(185);
    }
  });

  it("배포 사이 레지스트리의 추가/삭제/재정렬 후에도 같은 날 중복이나 누락이 없다", () => {
    const original = Array.from({ length: 185 }, (_, i) => `city-${i}`);
    const updated = [...original.slice(10).reverse(), "new-city"];
    const now = Date.parse("2026-10-01T00:00:00Z");
    rotatePressCities(original, 6, now);
    const ordered = rotatePressCities(updated, 6, now);
    expect(new Set(ordered).size).toBe(updated.length);
    expect([...ordered].sort()).toEqual([...updated].sort());
  });
});
