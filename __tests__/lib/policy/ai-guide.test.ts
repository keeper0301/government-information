import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock("@/lib/llm/text", () => ({
  callLLM: mocks.callLLM,
  // 실제 lib/llm/text.ts 와 동일하게 invalid JSON 이면 throw.
  parseJSONResponse: (raw: string) => JSON.parse(raw),
}));

import { generatePolicyGuide, buildPolicyGuidePrompt } from "@/lib/policy/ai-guide";

describe("buildPolicyGuidePrompt", () => {
  it("정책 제목·카테고리를 prompt 에 담는다", () => {
    const p = buildPolicyGuidePrompt({
      title: "청년 월세 지원",
      summary: "저소득 청년 월세 보조",
      category: "주거",
      target: "청년",
    });
    expect(p).toContain("청년 월세 지원");
    expect(p).toContain("주거");
    expect(p).toContain("JSON");
  });
});

describe("generatePolicyGuide", () => {
  beforeEach(() => mocks.callLLM.mockReset());
  afterEach(() => vi.clearAllMocks());

  it("LLM JSON 응답을 tips/faq/checklist 로 정리한다", async () => {
    mocks.callLLM.mockResolvedValueOnce(
      JSON.stringify({
        tips: "신청 전 소득 기준을 먼저 확인하면 시간을 아낄 수 있습니다.",
        faq: "서류 누락이 가장 흔한 탈락 사유입니다.",
        checklist: "주민등록등본, 임대차계약서, 소득증빙을 준비하세요.",
      }),
    );
    const g = await generatePolicyGuide({
      title: "청년 월세 지원", summary: null, category: "주거", target: "청년",
    });
    expect(g.tips).toContain("소득 기준");
    expect(g.faq).toContain("서류 누락");
    expect(g.checklist).toContain("임대차계약서");
  });

  it("HTML 태그를 제거하고 한국어 없는 값은 null 로 만든다", async () => {
    mocks.callLLM.mockResolvedValueOnce(
      JSON.stringify({
        tips: "<p>소득 기준을 먼저 확인하세요. 충분히 긴 한국어 문장입니다.</p>",
        faq: "ENGLISH ONLY NO KOREAN 12345 abcde",
        checklist: "짧음",
      }),
    );
    const g = await generatePolicyGuide({
      title: "x", summary: null, category: null, target: null,
    });
    expect(g.tips).not.toContain("<p>");
    expect(g.tips).toContain("소득 기준");
    expect(g.faq).toBeNull();       // 한국어 없음
    expect(g.checklist).toBeNull(); // 10자 미만
  });

  it("LLM 이 잘못된 JSON 을 주면 모두 null + llmOk=false (일시 실패 → 재시도)", async () => {
    mocks.callLLM.mockResolvedValueOnce("not json at all");
    const g = await generatePolicyGuide({
      title: "x", summary: null, category: null, target: null,
    });
    expect(g).toEqual({ tips: null, faq: null, checklist: null, llmOk: false });
  });

  it("LLM 성공했으나 sanitize 전부 실패면 llmOk=true (영구 부적합 → sentinel 대상)", async () => {
    mocks.callLLM.mockResolvedValueOnce(
      JSON.stringify({ tips: "abc", faq: "ENGLISH ONLY 123", checklist: "" }),
    );
    const g = await generatePolicyGuide({
      title: "x", summary: null, category: null, target: null,
    });
    expect(g).toEqual({ tips: null, faq: null, checklist: null, llmOk: true });
  });
});
