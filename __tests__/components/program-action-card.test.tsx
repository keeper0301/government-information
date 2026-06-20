import { describe, expect, it } from "vitest";
import { buildActionStatus, formatActionDate } from "@/components/program-action-card";

describe("ProgramActionCard helpers", () => {
  it("마감된 정책은 신청 마감으로 표시한다", () => {
    expect(
      buildActionStatus({ applyUrl: "https://example.com", isClosed: true, dday: -1 }),
    ).toMatchObject({ label: "신청 마감", tone: "closed" });
  });

  it("D-7 이내 정책은 긴급 마감으로 표시한다", () => {
    expect(
      buildActionStatus({ applyUrl: "https://example.com", isClosed: false, dday: 3 }),
    ).toMatchObject({ label: "마감 D-3", tone: "urgent" });
  });

  it("신청 링크가 있는 상시 정책은 상시 신청으로 표시한다", () => {
    expect(
      buildActionStatus({ applyUrl: "https://example.com", isClosed: false, dday: null }),
    ).toMatchObject({ label: "상시 신청", tone: "open" });
  });

  it("신청 링크가 없으면 확인 필요로 표시한다", () => {
    expect(
      buildActionStatus({ applyUrl: null, isClosed: false, dday: null }),
    ).toMatchObject({ label: "신청처 확인 필요", tone: "unknown" });
  });

  it("날짜를 한국 날짜 형식으로 포맷한다", () => {
    expect(formatActionDate("2026-06-19T00:00:00.000Z")).toContain("2026");
    expect(formatActionDate(null)).toBe("확인 중");
    expect(formatActionDate("not-a-date")).toBe("확인 중");
  });
});
