// __tests__/personalization/snapshot.test.ts
// ============================================================
// score 회귀 방지 snapshot — 페르소나 5 × fixture 18 매트릭스
// ============================================================
// PERSONAS array 는 self 제외 5명 (self 는 DB fetch 라 fixture 부적합 — 제외).
// summarizeTrace 결과를 vitest snapshot 으로 baseline. score.ts 변경 시
// 분포가 바뀌면 npm test 가 fail. 의도된 변경 시 vitest -u 로 갱신.
//
// 핵심 시나리오 7개는 hardcoded assertion — snapshot 분포로는 못 잡는
// "어떤 정책이 어떤 BlockReason 인지" 명시 회귀 차단.
// ============================================================

import { describe, expect, it } from "vitest";
import { traceScore, summarizeTrace } from "@/lib/personalization/diagnostic";
import { PERSONAL_SECTION_MIN_SCORE } from "@/lib/personalization/types";
import { PERSONAS } from "@/app/admin/recommendation-trace/personas";
import {
  ALL_FIXTURES,
  singleParentSupport,
  multiChildSupport,
  veteranSupport,
  elderlyHealthcare,
  busanFarmerSupport,
  multiculturalSupport,
} from "./snapshot-fixtures";

// production 페이지의 minScore 와 동일 (lib/personalization/types.ts) — 통일
const MIN_SCORE = PERSONAL_SECTION_MIN_SCORE;

describe("score 회귀 방지 — 페르소나별 BlockReason 분포 snapshot", () => {
  for (const persona of PERSONAS) {
    it(`페르소나 ${persona.id} (${persona.label}) — fixture 18개 분포`, () => {
      const traces = ALL_FIXTURES.map((p) =>
        traceScore(p, persona.signals, MIN_SCORE),
      );
      const summary = summarizeTrace(traces);
      expect({
        personaId: persona.id,
        personaLabel: persona.label,
        total: summary.total,
        shown: summary.shown,
        blocked: summary.blocked,
        scoreDistribution: summary.scoreDistribution,
      }).toMatchSnapshot();
    });
  }
});

describe("score 회귀 방지 — 핵심 시나리오 hardcoded assertion", () => {
  // 페르소나 5 (40대 경기 한부모 다자녀) — 한부모 정책 노출되어야 함
  it("p5 (한부모 다자녀) → 한부모 정책 shown", () => {
    const p5 = PERSONAS.find((p) => p.id === "p5")!;
    const r = traceScore(singleParentSupport, p5.signals, MIN_SCORE);
    expect(r.blockReason).toBe("shown");
  });

  // 페르소나 5 → 다자녀 정책도 shown
  it("p5 (한부모 다자녀) → 다자녀 정책 shown", () => {
    const p5 = PERSONAS.find((p) => p.id === "p5")!;
    const r = traceScore(multiChildSupport, p5.signals, MIN_SCORE);
    expect(r.blockReason).toBe("shown");
  });

  // 페르소나 6 (보훈) → 보훈 정책 shown (cohort gate 통과)
  it("p6 (보훈) → 보훈 정책 shown", () => {
    const p6 = PERSONAS.find((p) => p.id === "p6")!;
    const r = traceScore(veteranSupport, p6.signals, MIN_SCORE);
    expect(r.blockReason).toBe("shown");
  });

  // 페르소나 4 (대학생 single) → 다자녀 정책 household_gate 차단
  it("p4 (대학생 single) → 다자녀 정책 household_gate", () => {
    const p4 = PERSONAS.find((p) => p.id === "p4")!;
    const r = traceScore(multiChildSupport, p4.signals, MIN_SCORE);
    expect(r.blockReason).toBe("household_gate");
  });

  // 페르소나 5 (경기) → 부산 정책 regional_gate 차단
  it("p5 (경기) → 부산 정책 regional_gate", () => {
    const p5 = PERSONAS.find((p) => p.id === "p5")!;
    const r = traceScore(busanFarmerSupport, p5.signals, MIN_SCORE);
    expect(r.blockReason).toBe("regional_gate");
  });

  // 페르소나 2 (30대 직장인) → 노인 정책 cohort_mismatch
  it("p2 (30대 직장인) → 노인 정책 cohort_mismatch", () => {
    const p2 = PERSONAS.find((p) => p.id === "p2")!;
    const r = traceScore(elderlyHealthcare, p2.signals, MIN_SCORE);
    expect(r.blockReason).toBe("cohort_mismatch");
  });

  // 페르소나 4 (대학생) → 다문화 정책 cohort_mismatch
  it("p4 (대학생) → 다문화 정책 cohort_mismatch", () => {
    const p4 = PERSONAS.find((p) => p.id === "p4")!;
    const r = traceScore(multiculturalSupport, p4.signals, MIN_SCORE);
    expect(r.blockReason).toBe("cohort_mismatch");
  });
});
