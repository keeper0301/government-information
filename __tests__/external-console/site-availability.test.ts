// ============================================================
// site-availability buildAvailabilityAlerts 단위 테스트
// ============================================================
// 다운 페이지 (site_down) + 느린 페이지 (site_slow ≥ 5초) 검증.
// 2026-05-19 (저녁) — 임계 3초 → 5초 상향에 맞춰 fixture 업데이트.
// 옛 `__tests__/lib/site-availability.test.ts` 와 통합 (network error + 정확 경계 케이스 흡수).
// ============================================================

import { describe, it, expect } from "vitest";
import {
  buildAvailabilityAlerts,
  type CheckOneResult,
} from "@/lib/external-console/site-availability";

const ok = (label: string, ms: number, path = "/"): CheckOneResult => ({
  path,
  label,
  ok: true,
  status: 200,
  durationMs: ms,
});

const fail = (
  label: string,
  status: number | null,
  err = "fail",
  path = "/",
): CheckOneResult => ({
  path,
  label,
  ok: false,
  status,
  durationMs: 0,
  error: err,
});

describe("buildAvailabilityAlerts", () => {
  it("모두 정상 + 빠름 → alert 없음", () => {
    const out = buildAvailabilityAlerts([
      ok("home", 500),
      ok("welfare", 800),
      ok("loan", 600),
    ]);
    expect(out).toHaveLength(0);
  });

  it("1 페이지 다운 → site_down alert", () => {
    const out = buildAvailabilityAlerts([
      ok("home", 500),
      fail("welfare", 503, "ERR"),
      ok("loan", 700),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("site_down");
    expect(out[0].message).toContain("1/3");
    expect(out[0].message).toContain("welfare");
    expect(out[0].recommendation).toContain("Vercel");
  });

  it("network error → status null + error 메시지 포함", () => {
    const out = buildAvailabilityAlerts([
      fail("홈", null, "fetch aborted: timeout"),
    ]);
    const a = out.find((x) => x.key === "site_down");
    expect(a?.message).toContain("홈(fetch aborted");
  });

  it("느린 페이지 (≥5초) → site_slow alert", () => {
    const out = buildAvailabilityAlerts([
      ok("home", 500),
      ok("welfare", 5500),
      ok("loan", 6200),
    ]);
    const slow = out.find((a) => a.key === "site_slow");
    expect(slow).toBeDefined();
    expect(slow?.message).toContain("2건");
    expect(slow?.message).toContain("welfare");
    expect(slow?.recommendation).toContain("DB 쿼리");
  });

  it("5초 미만 → site_slow alert 발송 안 함 (정확 경계)", () => {
    const out = buildAvailabilityAlerts([ok("홈", 4999)]);
    expect(out.find((a) => a.key === "site_slow")).toBeUndefined();
  });

  it("다운 + 느린 동시 → 2 alerts", () => {
    const out = buildAvailabilityAlerts([
      fail("home", null, "timeout"),
      ok("welfare", 7000),
    ]);
    expect(out).toHaveLength(2);
    expect(out.some((a) => a.key === "site_down")).toBe(true);
    expect(out.some((a) => a.key === "site_slow")).toBe(true);
  });

  it("느린 페이지인데 ok=false → site_slow 집계 제외", () => {
    // 다운 페이지의 durationMs 가 7000 이라도 ok=false 라 slow 집계 X
    const out = buildAvailabilityAlerts([fail("home", 500, "ERR")]);
    expect(out.find((a) => a.key === "site_slow")).toBeUndefined();
  });
});
