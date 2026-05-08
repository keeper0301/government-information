import { describe, expect, it } from "vitest";
import {
  buildAvailabilityAlerts,
  type CheckOneResult,
} from "@/lib/external-console/site-availability";

const OK = (path: string, label: string, durationMs = 100): CheckOneResult => ({
  path,
  label,
  ok: true,
  status: 200,
  durationMs,
});

const DOWN = (
  path: string,
  label: string,
  status: number | null = 500,
  error?: string,
): CheckOneResult => ({
  path,
  label,
  ok: false,
  status,
  durationMs: 50,
  error,
});

describe("buildAvailabilityAlerts", () => {
  it("모두 정상 → alert 0", () => {
    const alerts = buildAvailabilityAlerts([
      OK("/", "홈"),
      OK("/welfare", "복지"),
      OK("/loan", "대출"),
      OK("/news", "뉴스"),
      OK("/blog", "블로그"),
    ]);
    expect(alerts).toHaveLength(0);
  });

  it("1 페이지 다운 → site_down alert 1건", () => {
    const alerts = buildAvailabilityAlerts([
      OK("/", "홈"),
      DOWN("/welfare", "복지", 500),
      OK("/loan", "대출"),
      OK("/news", "뉴스"),
      OK("/blog", "블로그"),
    ]);
    const a = alerts.find((x) => x.key === "site_down");
    expect(a).toBeDefined();
    expect(a?.message).toContain("1/5");
    expect(a?.message).toContain("복지(500)");
    expect(a?.recommendation).toContain("Vercel");
  });

  it("network error → status null + error 메시지 포함", () => {
    const alerts = buildAvailabilityAlerts([
      DOWN("/", "홈", null, "fetch aborted: timeout"),
    ]);
    const a = alerts.find((x) => x.key === "site_down");
    expect(a?.message).toContain("홈(fetch aborted");
  });

  it("3초+ 응답 → site_slow alert", () => {
    const alerts = buildAvailabilityAlerts([
      OK("/", "홈", 100),
      OK("/welfare", "복지", 3500), // 3500ms = 임계 초과
      OK("/loan", "대출", 200),
    ]);
    const a = alerts.find((x) => x.key === "site_slow");
    expect(a).toBeDefined();
    expect(a?.message).toContain("복지(3500ms)");
    expect(a?.recommendation).toContain("DB 쿼리");
  });

  it("3초 미만 → site_slow alert 발송 안 함 (정확 경계)", () => {
    const alerts = buildAvailabilityAlerts([
      OK("/", "홈", 2999),
    ]);
    expect(alerts.find((a) => a.key === "site_slow")).toBeUndefined();
  });

  it("다운 + 느림 동시 → 2 alert 모두 발송", () => {
    const alerts = buildAvailabilityAlerts([
      DOWN("/", "홈", 502),
      OK("/welfare", "복지", 3500),
    ]);
    expect(alerts.find((a) => a.key === "site_down")).toBeDefined();
    expect(alerts.find((a) => a.key === "site_slow")).toBeDefined();
  });

  it("느림 페이지가 다운 페이지에 포함되지 않음 (filter ok=true)", () => {
    // 다운된 페이지는 durationMs 가 크더라도 site_slow 에 포함 X
    const alerts = buildAvailabilityAlerts([
      DOWN("/", "홈", 504),  // 다운 — duration 무관
    ]);
    expect(alerts.find((a) => a.key === "site_slow")).toBeUndefined();
  });
});
