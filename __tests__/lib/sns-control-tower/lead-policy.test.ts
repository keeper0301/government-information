import { describe, expect, it } from "vitest";
import {
  buildLeadPolicySnapshot,
  nextChallengerTrafficPct,
  normalizeChallengerTrafficInput,
  normalizeLeadPolicyInput,
} from "@/lib/sns-control-tower/lead-policy";

describe("SNS lead policy", () => {
  it("latest admin action per lead를 정책 snapshot으로 접는다", () => {
    const snapshot = buildLeadPolicySnapshot([
      {
        created_at: "2026-06-20T02:00:00.000Z",
        details: { content: "lead_1", status: "paused", reason: "성과 낮음" },
      },
      {
        created_at: "2026-06-20T01:00:00.000Z",
        details: { content: "lead_1", status: "active", reason: "이전 상태" },
      },
      {
        created_at: "2026-06-20T01:30:00.000Z",
        details: { content: "lead_2", status: "active" },
      },
    ]);

    expect(snapshot.disabledLeadVariants).toEqual(["lead_1", "lead_3", "lead_4", "lead_5"]);
    expect(snapshot.policies).toEqual([
      expect.objectContaining({ content: "lead_0", status: "active" }),
      expect.objectContaining({ content: "lead_1", status: "paused", reason: "성과 낮음" }),
      expect.objectContaining({ content: "lead_2", status: "active" }),
      expect.objectContaining({ content: "lead_3", status: "paused" }),
      expect.objectContaining({ content: "lead_4", status: "paused" }),
      expect.objectContaining({ content: "lead_5", status: "paused" }),
    ]);
  });

  it("잘못된 입력은 저장 전에 차단한다", () => {
    expect(() => normalizeLeadPolicyInput({ content: "lead_9", status: "active" })).toThrow("invalid_lead_variant");
    expect(() => normalizeLeadPolicyInput({ content: "lead_1", status: "delete" })).toThrow("invalid_lead_status");
  });

  it("challenger 제한 노출 단계는 admin_actions 최신값으로 접고 허용 단계만 받는다", () => {
    const snapshot = buildLeadPolicySnapshot([
      {
        action: "sns_challenger_traffic_update",
        created_at: "2026-06-20T03:00:00.000Z",
        details: { pct: 35, reason: "확대 후보 확인" },
      },
      {
        action: "sns_challenger_traffic_update",
        created_at: "2026-06-20T02:00:00.000Z",
        details: { pct: 20, reason: "초기 제한" },
      },
    ]);

    expect(snapshot.challengerTrafficPct).toBe(35);
    expect(snapshot.challengerTrafficReason).toBe("확대 후보 확인");
    expect(normalizeChallengerTrafficInput({ pct: "50", reason: "최대" })).toEqual({ pct: 50, reason: "최대" });
    expect(() => normalizeChallengerTrafficInput({ pct: "80" })).toThrow("invalid_challenger_traffic_pct");
    expect(nextChallengerTrafficPct(20)).toBe(35);
    expect(nextChallengerTrafficPct(35)).toBe(50);
    expect(nextChallengerTrafficPct(50)).toBeNull();
  });
});
