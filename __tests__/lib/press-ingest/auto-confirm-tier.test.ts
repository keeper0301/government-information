// ============================================================
// auto-confirm 단계에서 confidence_tier 가 candidate row 에 보존되는지 검증
// ============================================================
// Task 3 — TDD: classify.ts 가 반환한 confidence (high/mid/low) 를
// buildCandidateUpsert 가 confidence_tier 컬럼에 그대로 채워야 한다.
// is_policy=false 로 skipped 되는 후보는 자동 confirm 대상에서 제외 → null.
// ============================================================
import { describe, it, expect } from "vitest";
import { buildCandidateUpsert } from "@/lib/press-ingest/candidates";
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
