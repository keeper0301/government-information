// ============================================================
// self-learning-digest cron pure formatter unit test
// ============================================================
// 텔레그램 메시지 형식 보장. cron route 의 buildXxxLine 함수만 검증.
// admin_actions DB 호출은 integration 영역.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  buildPressTierLine,
  buildPopularityLine,
  buildPushLearnLine,
} from "@/lib/autonomous-ops/self-learning-digest";

describe("self-learning-digest formatter", () => {
  describe("buildPressTierLine", () => {
    it("결과 없음 → 경고 라인", () => {
      const lines = buildPressTierLine(null);
      expect(lines).toEqual(["  ⚠️ 결과 없음 (cron 미가동 또는 fetch 실패)"]);
    });

    it("no_change outcome → ⏸ icon + 같은 floor 한 번만", () => {
      const lines = buildPressTierLine({
        details: {
          outcome: "no_change",
          current: "high",
          next: "high",
          reason: "mid 회수율 0.0% — 변경 없음",
        },
        created_at: "2026-06-01T17:00:00Z",
      });
      expect(lines[0]).toBe("  ⏸ no_change (high)");
      expect(lines[1]).toContain("mid 회수율");
    });

    it("changed outcome → ✅ icon + arrow + reason", () => {
      const lines = buildPressTierLine({
        details: {
          outcome: "changed",
          current: "high",
          next: "mid",
          reason: "low confirm 60% — 확장",
        },
        created_at: "2026-06-01T17:00:00Z",
      });
      expect(lines[0]).toBe("  ✅ changed (high → mid)");
      expect(lines[1]).toContain("low confirm");
    });

    it("긴 reason 자동 truncate (200자 cap)", () => {
      const longReason = "가".repeat(300);
      const lines = buildPressTierLine({
        details: { outcome: "changed", current: "high", next: "mid", reason: longReason },
        created_at: "2026-06-01T17:00:00Z",
      });
      expect(lines[1].length).toBeLessThanOrEqual(202); // "  " + 200
    });
  });

  describe("buildPopularityLine", () => {
    it("결과 없음 → 경고", () => {
      expect(buildPopularityLine(null)).toEqual(["  ⚠️ 결과 없음"]);
    });

    it("current weights 표시 (view/apply/max)", () => {
      const lines = buildPopularityLine({
        details: {
          outcome: "no_change",
          current: { viewWeight: 0.5, applyWeight: 2, maxBoost: 5 },
          reason: "전환율 정상 범위",
        },
        created_at: "2026-06-01T17:30:00Z",
      });
      expect(lines[0]).toBe("  ⏸ no_change (view=0.5 apply=2 max=5)");
      expect(lines[1]).toContain("정상");
    });

    it("current 없을 때 - 표시 (graceful)", () => {
      const lines = buildPopularityLine({
        details: { outcome: "unknown" },
        created_at: "2026-06-01T17:30:00Z",
      });
      expect(lines[0]).toBe("  ⏸ unknown (-)");
    });
  });

  describe("buildPushLearnLine", () => {
    it("결과 없음 → 경고", () => {
      expect(buildPushLearnLine(null)).toEqual(["  ⚠️ 결과 없음 (subscriber 0?)"]);
    });

    it("total 0 → ⏸ no_active_users", () => {
      const lines = buildPushLearnLine({
        details: { total: 0, changed: 0, skipped: 0 },
        created_at: "2026-06-01T18:00:00Z",
      });
      expect(lines).toEqual(["  ⏸ no_active_users (subscriber 0)"]);
    });

    it("total ≥ 1 → ✅ user 수 + 변경/skip 카운트", () => {
      const lines = buildPushLearnLine({
        details: { total: 5, changed: 2, skipped: 3 },
        created_at: "2026-06-01T18:00:00Z",
      });
      expect(lines[0]).toBe("  ✅ user 5명 학습 — 변경 2 · skip 3");
    });
  });
});
