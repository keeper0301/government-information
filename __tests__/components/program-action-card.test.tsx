import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/alarm-button", () => ({
  AlarmButton: () => <button>알림 받기</button>,
}));

vi.mock("@/components/bookmark-button", () => ({
  BookmarkButton: () => <button>찜하기</button>,
}));

vi.mock("@/components/analytics/apply-click-tracker", () => ({
  ApplyClickTracker: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import {
  ProgramActionCard,
  buildActionStatus,
  formatActionDate,
} from "@/components/program-action-card";

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

  it("D-day 당일은 긴급 마감으로 표시한다", () => {
    expect(
      buildActionStatus({ applyUrl: "https://example.com", isClosed: false, dday: 0 }),
    ).toMatchObject({ label: "마감 D-0", tone: "urgent" });
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

describe("ProgramActionCard rendering", () => {
  const baseProps = {
    kind: "loan" as const,
    programId: "loan-1",
    title: "소상공인 정책자금",
    source: "중소벤처기업부",
    sourcePage: "/loan/loan-1",
    applyUrl: "https://example.com/apply",
    applyEnd: "2026-07-01",
    dday: 5,
    isClosed: false,
    updatedAt: "2026-06-19T00:00:00.000Z",
  };

  it("신청 가능한 정책은 직접 신청 링크를 렌더한다", () => {
    const html = renderToStaticMarkup(<ProgramActionCard {...baseProps} />);

    expect(html).toContain("마감 D-5");
    expect(html).toContain("https://example.com/apply");
    expect(html).toContain("신청하러 가기");
  });

  it("마감된 정책은 직접 신청 링크 대신 신청 방법 검색 링크를 렌더한다", () => {
    const html = renderToStaticMarkup(
      <ProgramActionCard {...baseProps} dday={-1} isClosed />,
    );

    expect(html).toContain("신청 마감");
    expect(html).not.toContain("https://example.com/apply");
    expect(html).toContain("신청 방법 찾기");
    expect(html).toContain(encodeURIComponent("중소벤처기업부 소상공인 정책자금 신청"));
  });

  it("출처가 없으면 공식 기관 fallback 으로 검색어를 만든다", () => {
    const html = renderToStaticMarkup(
      <ProgramActionCard {...baseProps} source={null} applyUrl={null} dday={null} />,
    );

    expect(html).toContain("출처: 공식 기관");
    expect(html).toContain("%EA%B3%B5%EC%8B%9D%20%EA%B8%B0%EA%B4%80%20%EC%86%8C%EC%83%81%EA%B3%B5%EC%9D%B8%20%EC%A0%95%EC%B1%85%EC%9E%90%EA%B8%88%20%EC%8B%A0%EC%B2%AD");
  });
});
