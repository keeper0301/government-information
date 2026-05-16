// ============================================================
// kakao buildKakaoAlerts 단위 테스트
// ============================================================
// 5/14 Solapi 잔액 0원 사고 (SMS 5일 다운) 회귀 방지.
// statusCode 분류 (2xxx success / 4xxx·5xxx failed / 그 외 pending) +
// 실패율 임계 (≥10% + total ≥5) + pending 누적 임계 (≥10) 검증.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  buildKakaoAlerts,
  type SolapiMessageRow,
} from "@/lib/external-console/kakao";

function row(statusCode: string, type = "ATA"): SolapiMessageRow {
  return { statusCode, type };
}

describe("buildKakaoAlerts", () => {
  it("발송 0건 → alert 없음 (저트래픽 정상)", () => {
    const out = buildKakaoAlerts([]);
    expect(out.alerts).toHaveLength(0);
    expect(out.kpis.total_24h).toBe(0);
    expect(out.kpis.failure_rate).toBe(0);
  });

  it("전체 성공 (2000) → alert 없음", () => {
    const out = buildKakaoAlerts([row("2000"), row("2000"), row("2000")]);
    expect(out.alerts).toHaveLength(0);
    expect(out.kpis.success_24h).toBe(3);
    expect(out.kpis.failed_24h).toBe(0);
  });

  it("실패율 10%+ + total ≥5 → kakao_high_failure alert", () => {
    // 5건 중 1건 실패 (20%) — 임계 충족
    const out = buildKakaoAlerts([
      row("2000"),
      row("2000"),
      row("2000"),
      row("2000"),
      row("4030"), // NotEnoughBalance — 5/14 사고 패턴
    ]);
    expect(out.alerts).toHaveLength(1);
    expect(out.alerts[0].key).toBe("kakao_high_failure");
    expect(out.alerts[0].message).toContain("20%");
    expect(out.alerts[0].message).toContain("4030");
  });

  it("실패율 10%+ 인데 total < 5 → alert 안 함 (noisy 방지)", () => {
    // 2건 중 1건 실패 (50%) — total 부족
    const out = buildKakaoAlerts([row("2000"), row("4030")]);
    expect(out.alerts).toHaveLength(0);
    expect(out.kpis.failure_rate).toBe(0.5);
  });

  it("pending ≥ 10 → kakao_pending_stuck alert", () => {
    const messages = Array.from({ length: 12 }, () => row("3030"));
    const out = buildKakaoAlerts(messages);
    expect(out.alerts.find((a) => a.key === "kakao_pending_stuck")).toBeDefined();
    expect(out.kpis.pending_24h).toBe(12);
  });

  it("statusCode 누락 → pending 분류", () => {
    const out = buildKakaoAlerts([{ type: "ATA" } as SolapiMessageRow]);
    expect(out.kpis.pending_24h).toBe(1);
    expect(out.kpis.failed_24h).toBe(0);
  });

  it("failed_codes 분포 — 상위 3개만 메시지에 (집중 코드 식별)", () => {
    const messages: SolapiMessageRow[] = [
      ...Array.from({ length: 5 }, () => row("4030")), // 5건
      ...Array.from({ length: 3 }, () => row("4040")), // 3건
      ...Array.from({ length: 2 }, () => row("5000")), // 2건
      ...Array.from({ length: 90 }, () => row("2000")), // success padding
    ];
    const out = buildKakaoAlerts(messages);
    const failed_codes = out.kpis.failed_codes as Record<string, number>;
    expect(failed_codes["4030"]).toBe(5);
    expect(failed_codes["4040"]).toBe(3);
    expect(failed_codes["5000"]).toBe(2);
  });
});
