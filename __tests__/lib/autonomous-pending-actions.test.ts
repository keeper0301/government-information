// ============================================================
// aggregatePendingActions 단위 테스트
// ============================================================
// 5 phase 의 pendingActions 를 한 리스트로 통합 + phase 메타 보존.
// hub 페이지 PendingActionsPanel 의 회귀 방지.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  aggregatePendingActions,
  type PhaseStatus,
} from "@/lib/autonomous-ops/status";

function phase(
  phaseNum: PhaseStatus["phase"],
  title: string,
  actions: PhaseStatus["pendingActions"],
): PhaseStatus {
  return {
    phase: phaseNum,
    title,
    active: actions.length === 0,
    metrics: [],
    pendingActions: actions,
  };
}

describe("aggregatePendingActions", () => {
  it("모든 phase 의 pendingActions 0 건이면 빈 배열", () => {
    const phases: PhaseStatus[] = [
      phase(1, "사고 자동 진단", []),
      phase(2, "SMS 결정 위임", []),
      phase(3, "외부 콘솔", []),
      phase(4, "AI 챗봇 CS", []),
      phase(5, "마케팅 자동화", []),
    ];
    expect(aggregatePendingActions(phases)).toEqual([]);
  });

  it("phase 2 에 1건 있으면 phase 메타 포함 1건 반환", () => {
    const phases: PhaseStatus[] = [
      phase(1, "사고 자동 진단", []),
      phase(2, "SMS 결정 위임", [{ text: "DDL 075 적용 필요" }]),
      phase(3, "외부 콘솔", []),
      phase(4, "AI 챗봇 CS", []),
      phase(5, "마케팅 자동화", []),
    ];
    const agg = aggregatePendingActions(phases);
    expect(agg).toHaveLength(1);
    expect(agg[0]).toEqual({
      text: "DDL 075 적용 필요",
      phase: 2,
      phaseTitle: "SMS 결정 위임",
    });
  });

  it("phase 3·5 에 각 2건씩 = 총 4건 통합", () => {
    const phases: PhaseStatus[] = [
      phase(1, "사고 자동 진단", []),
      phase(2, "SMS 결정 위임", []),
      phase(3, "외부 콘솔", [
        { text: "AdSense OAuth", url: "https://example.com/adsense" },
        { text: "GA4 OAuth", url: "https://example.com/ga4" },
      ]),
      phase(4, "AI 챗봇 CS", []),
      phase(5, "마케팅 자동화", [
        { text: "Twitter OAuth", url: "https://example.com/twitter" },
        { text: "Meta OAuth", url: "https://example.com/meta" },
      ]),
    ];
    const agg = aggregatePendingActions(phases);
    expect(agg).toHaveLength(4);
    // 순서 보존 (Phase 3 → 5)
    expect(agg[0].phase).toBe(3);
    expect(agg[1].phase).toBe(3);
    expect(agg[2].phase).toBe(5);
    expect(agg[3].phase).toBe(5);
  });

  it("url 필드 그대로 보존", () => {
    const phases: PhaseStatus[] = [
      phase(2, "SMS 결정 위임", [
        { text: "webhook 등록", url: "https://console.solapi.com" },
      ]),
    ];
    const agg = aggregatePendingActions(phases);
    expect(agg[0].url).toBe("https://console.solapi.com");
  });

  it("url 없는 액션도 phase 메타 포함", () => {
    const phases: PhaseStatus[] = [
      phase(2, "SMS 결정 위임", [{ text: "DDL 075 사장님 명시 승인 필요" }]),
    ];
    const agg = aggregatePendingActions(phases);
    expect(agg[0].url).toBeUndefined();
    expect(agg[0].phase).toBe(2);
  });

  it("phaseTitle 이 phase 의 title 과 일치 (메타 누출 검증)", () => {
    const phases: PhaseStatus[] = [
      phase(5, "마케팅 자동화", [{ text: "SNS 발급" }]),
    ];
    const agg = aggregatePendingActions(phases);
    expect(agg[0].phaseTitle).toBe("마케팅 자동화");
  });
});
