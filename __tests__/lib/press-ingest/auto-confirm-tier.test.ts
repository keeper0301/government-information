// ============================================================
// auto-confirm 단계에서 confidence_tier 가 candidate row 에 보존되는지 검증
// ============================================================
// Task 3 — TDD: classify.ts 가 반환한 confidence (high/mid/low) 를
// buildCandidateUpsert 가 confidence_tier 컬럼에 그대로 채워야 한다.
// is_policy=false 로 skipped 되는 후보는 자동 confirm 대상에서 제외 → null.
// ============================================================
import { describe, it, expect } from "vitest";
import {
  buildCandidateUpsert,
  shouldAutoConfirm,
} from "@/lib/press-ingest/candidates";
import type { ClassifyResult } from "@/lib/press-ingest/classify";

// 기본 정책 결과 fixture — 테스트 별로 confidence/program_type/is_policy 등만 override
function makeResult(overrides: Partial<ClassifyResult>): ClassifyResult {
  return {
    is_policy: true,
    program_type: "welfare",
    title: "test",
    target: "",
    eligibility: "",
    benefits: "",
    apply_method: "",
    apply_url: "https://welfare.seoul.go.kr/x",
    body_urls: [],
    apply_start: null,
    apply_end: null,
    category: "주거",
    confidence: "high",
    ...overrides,
  };
}

describe("buildCandidateUpsert — confidence_tier 보존", () => {
  it("welfare + high → status='pending', confidence_tier='high'", () => {
    const upsert = buildCandidateUpsert({
      newsId: "n1",
      result: makeResult({ confidence: "high" }),
    });
    expect(upsert.status).toBe("pending");
    expect(upsert.program_type).toBe("welfare");
    expect(upsert.confidence_tier).toBe("high");
  });

  it("loan + mid → status='pending', confidence_tier='mid'", () => {
    const upsert = buildCandidateUpsert({
      newsId: "n2",
      result: makeResult({ program_type: "loan", confidence: "mid" }),
    });
    expect(upsert.confidence_tier).toBe("mid");
  });

  it("welfare + low → status='pending', confidence_tier='low' (autoConfirm 분기 입력)", () => {
    const upsert = buildCandidateUpsert({
      newsId: "n3",
      result: makeResult({ confidence: "low" }),
    });
    expect(upsert.status).toBe("pending");
    expect(upsert.confidence_tier).toBe("low");
  });

  it("is_policy=false → status='skipped', confidence_tier=null (자동 confirm 대상 X)", () => {
    const upsert = buildCandidateUpsert({
      newsId: "n4",
      result: makeResult({ is_policy: false }),
    });
    expect(upsert.status).toBe("skipped");
    expect(upsert.confidence_tier).toBeNull();
  });
});

// Task 4 — autoConfirm 단계의 tier filter 분기.
// AUTO_CONFIRM_TIER_FLOOR env 기반으로 high/mid/low 중 어디부터 자동 confirm 할지 결정.
// default 'mid' (high+mid 자동 confirm, low 는 사장님 검토 큐로 유지) — 운영 보수적 기본값.
describe("shouldAutoConfirm — tier 분기 + AUTO_CONFIRM_TIER_FLOOR env", () => {
  it("default floor='mid' → high/mid 자동, low pending", () => {
    delete process.env.AUTO_CONFIRM_TIER_FLOOR;
    expect(shouldAutoConfirm("high")).toBe(true);
    expect(shouldAutoConfirm("mid")).toBe(true);
    expect(shouldAutoConfirm("low")).toBe(false);
  });

  it("floor='high' → high 만 자동", () => {
    process.env.AUTO_CONFIRM_TIER_FLOOR = "high";
    expect(shouldAutoConfirm("high")).toBe(true);
    expect(shouldAutoConfirm("mid")).toBe(false);
    expect(shouldAutoConfirm("low")).toBe(false);
  });

  it("floor='low' → 모두 자동 (적극 모드)", () => {
    process.env.AUTO_CONFIRM_TIER_FLOOR = "low";
    expect(shouldAutoConfirm("high")).toBe(true);
    expect(shouldAutoConfirm("mid")).toBe(true);
    expect(shouldAutoConfirm("low")).toBe(true);
  });

  it("invalid floor 값 → default 'mid' fallback", () => {
    process.env.AUTO_CONFIRM_TIER_FLOOR = "extreme";
    expect(shouldAutoConfirm("high")).toBe(true);
    expect(shouldAutoConfirm("mid")).toBe(true);
    expect(shouldAutoConfirm("low")).toBe(false);
  });

  it("confidence_tier=null (legacy 후보) → 자동 confirm X (보수적)", () => {
    delete process.env.AUTO_CONFIRM_TIER_FLOOR;
    expect(shouldAutoConfirm(null)).toBe(false);
  });
});
