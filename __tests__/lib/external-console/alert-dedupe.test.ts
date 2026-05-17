import { describe, expect, it } from "vitest";
import { partitionByKey } from "@/lib/external-console/alert-dedupe";
import type { ConsoleAlert } from "@/lib/external-console/types";

// G7 (2026-05-17) — per-key 24h dedupe 순수 함수 단위 테스트.
// filterRecentlyAlertedKeys (DB fetch) 는 통합 테스트 영역.

const ALERT = (key: string): ConsoleAlert => ({
  key,
  message: `msg for ${key}`,
  recommendation: "fix it",
});

describe("partitionByKey (G7 dedupe 핵심)", () => {
  it("recentKeys 비어있으면 모두 active", () => {
    const result = partitionByKey(
      [ALERT("site_slow"), ALERT("solapi_balance_low")],
      new Set(),
    );
    expect(result.active).toHaveLength(2);
    expect(result.suppressed).toHaveLength(0);
  });

  it("alerts 비어있으면 active/suppressed 둘 다 0", () => {
    const result = partitionByKey([], new Set(["any_key"]));
    expect(result.active).toHaveLength(0);
    expect(result.suppressed).toHaveLength(0);
  });

  it("recentKeys 와 일치하는 alert 는 suppressed 로 분리", () => {
    const result = partitionByKey(
      [
        ALERT("site_slow"),           // 이미 발송 → suppressed
        ALERT("solapi_balance_low"),  // 이미 발송 → suppressed
        ALERT("vercel_last_deploy_failed"), // 신규 → active
      ],
      new Set(["site_slow", "solapi_balance_low"]),
    );
    expect(result.active).toHaveLength(1);
    expect(result.active[0].key).toBe("vercel_last_deploy_failed");
    expect(result.suppressed).toEqual(["site_slow", "solapi_balance_low"]);
  });

  it("모든 alert 가 recentKeys 면 active 0 (SMS 발송 skip)", () => {
    const result = partitionByKey(
      [ALERT("site_slow"), ALERT("ga4_no_traffic")],
      new Set(["site_slow", "ga4_no_traffic", "extra"]),
    );
    expect(result.active).toHaveLength(0);
    expect(result.suppressed).toEqual(["site_slow", "ga4_no_traffic"]);
  });

  it("같은 key 가 alerts 에 중복으로 와도 각각 suppressed 카운트 (실수 방지)", () => {
    // 실제 사용 시 같은 alert 는 한 cron 결과에서 1번만 나오지만,
    // 방어적으로 분기 동작을 명시화.
    const result = partitionByKey(
      [ALERT("site_slow"), ALERT("site_slow")],
      new Set(["site_slow"]),
    );
    expect(result.active).toHaveLength(0);
    expect(result.suppressed).toEqual(["site_slow", "site_slow"]);
  });
});
