import { describe, expect, it } from "vitest";
import { isTransientKakaoSkip, shouldRecordAlertDelivery } from "@/lib/alerts/delivery-ledger";

describe("alert delivery ledger policy", () => {
  it("일시적 카카오 skip 은 UNIQUE 원장에 기록하지 않는다", () => {
    for (const error of ["consent_missing", "quiet_hours_kst", "kakao_provider_not_configured"]) {
      expect(isTransientKakaoSkip(error)).toBe(true);
      expect(shouldRecordAlertDelivery({ channel: "kakao", status: "skipped", error })).toBe(false);
    }
  });

  it("영구 skip 과 실패/성공은 기록한다", () => {
    expect(shouldRecordAlertDelivery({ channel: "kakao", status: "skipped", error: "business_mismatch" })).toBe(true);
    expect(shouldRecordAlertDelivery({ channel: "kakao", status: "failed", error: "api_error" })).toBe(true);
    expect(shouldRecordAlertDelivery({ channel: "kakao", status: "sent" })).toBe(true);
    expect(shouldRecordAlertDelivery({ channel: "email", status: "skipped", error: "any" })).toBe(true);
  });
});
