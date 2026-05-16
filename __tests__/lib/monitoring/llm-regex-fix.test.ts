// ============================================================
// D-4 step 2 LLM regex fix 단위 테스트 — mock callLLM
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isLlmFixEnabled,
  proposeRegexFix,
  formatRegexProposal,
  type RegexProposal,
} from "@/lib/monitoring/llm-regex-fix";

// LLM 호출 mock — actual API 호출 차단
vi.mock("@/lib/llm/text", () => ({
  callLLM: vi.fn(),
  parseJSONResponse: vi.fn((text: string) => JSON.parse(text)),
}));

import { callLLM } from "@/lib/llm/text";

describe("isLlmFixEnabled", () => {
  beforeEach(() => {
    delete process.env.D4_AUTO_FIX_LLM_ENABLED;
  });

  it("env 미설정 → false", () => {
    expect(isLlmFixEnabled()).toBe(false);
  });

  it("'true' → true", () => {
    process.env.D4_AUTO_FIX_LLM_ENABLED = "true";
    expect(isLlmFixEnabled()).toBe(true);
  });

  it("'1' → true", () => {
    process.env.D4_AUTO_FIX_LLM_ENABLED = "1";
    expect(isLlmFixEnabled()).toBe(true);
  });
});

describe("proposeRegexFix — LLM 통합", () => {
  beforeEach(() => {
    process.env.D4_AUTO_FIX_LLM_ENABLED = "true";
    vi.clearAllMocks();
  });

  it("env 비활성화 → throw", async () => {
    process.env.D4_AUTO_FIX_LLM_ENABLED = "false";
    await expect(
      proposeRegexFix({
        domain: "suncheon",
        fnName: "parseDetailBody",
        currentRegex: "abc",
        sampleHtml: "<div>test</div>",
        targetExtract: "본문",
      }),
    ).rejects.toThrow("D4_AUTO_FIX_LLM_ENABLED 비활성화");
  });

  it("정상 LLM 응답 → RegexProposal 반환", async () => {
    vi.mocked(callLLM).mockResolvedValue(
      JSON.stringify({
        newRegex: "<div\\s+class=\"new_content\">([\\s\\S]*?)</div>",
        reason: "사이트 HTML 의 class 가 content → new_content 로 변경됨",
      }),
    );
    const sampleHtml = '<div class="new_content">실제 본문 텍스트</div>';
    const result = await proposeRegexFix({
      domain: "suncheon",
      fnName: "parseDetailBody",
      currentRegex: 'div class="content"',
      sampleHtml,
      targetExtract: "본문 텍스트",
    });
    expect(result.proposedRegex).toContain("new_content");
    expect(result.sampleMatchTested).toBe(true);
    expect(result.sampleExtract).toContain("실제 본문 텍스트");
    expect(result.reason).toContain("변경됨");
  });

  it("LLM 응답에 newRegex 누락 → throw", async () => {
    vi.mocked(callLLM).mockResolvedValue(
      JSON.stringify({ reason: "이유만 있음" }),
    );
    await expect(
      proposeRegexFix({
        domain: "suncheon",
        fnName: "parseDetailBody",
        currentRegex: "abc",
        sampleHtml: "<div>test</div>",
        targetExtract: "본문",
      }),
    ).rejects.toThrow("newRegex 누락");
  });

  it("invalid regex 응답 → throw", async () => {
    vi.mocked(callLLM).mockResolvedValue(
      JSON.stringify({ newRegex: "[unclosed", reason: "잘못" }),
    );
    await expect(
      proposeRegexFix({
        domain: "suncheon",
        fnName: "parseDetailBody",
        currentRegex: "abc",
        sampleHtml: "<div>test</div>",
        targetExtract: "본문",
      }),
    ).rejects.toThrow("invalid");
  });

  it("신규 regex 가 sample 매칭 실패 → sampleMatchTested=false", async () => {
    vi.mocked(callLLM).mockResolvedValue(
      JSON.stringify({
        newRegex: "<span>([\\s\\S]*?)</span>",
        reason: "span 으로 변경 추정",
      }),
    );
    const sampleHtml = '<div class="content">본문</div>'; // span 없음
    const result = await proposeRegexFix({
      domain: "suncheon",
      fnName: "parseDetailBody",
      currentRegex: 'div class="content"',
      sampleHtml,
      targetExtract: "본문",
    });
    expect(result.sampleMatchTested).toBe(false);
    expect(result.sampleExtract).toBeNull();
  });
});

describe("formatRegexProposal", () => {
  it("매칭 성공 → ✅ + 추출 sample 표시", () => {
    const proposal: RegexProposal = {
      domain: "suncheon",
      fnName: "parseDetailBody",
      currentRegex: "abc",
      proposedRegex: "xyz",
      sampleMatchTested: true,
      sampleExtract: "추출된 본문",
      reason: "이유",
    };
    const txt = formatRegexProposal(proposal);
    expect(txt).toContain("✅");
    expect(txt).toContain("추출된 본문");
  });

  it("매칭 실패 → ❌", () => {
    const proposal: RegexProposal = {
      domain: "suncheon",
      fnName: "parseDetailBody",
      currentRegex: "abc",
      proposedRegex: "xyz",
      sampleMatchTested: false,
      sampleExtract: null,
      reason: "이유",
    };
    expect(formatRegexProposal(proposal)).toContain("❌");
  });
});
