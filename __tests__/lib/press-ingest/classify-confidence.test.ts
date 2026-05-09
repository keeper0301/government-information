// ============================================================
// classify.ts confidence 필드 단위 테스트
// ============================================================
// LLM 응답에 confidence 가 있는 경우 / 누락 / invalid 3가지 케이스를
// 모두 검증. 누락·invalid 시 보수적으로 'low' 로 fallback 하는지 확인.
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// fetch mock — OpenAI Chat Completion 호출 가로채기
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("OPENAI_API_KEY", "test-key");
});

import { classifyPressNews } from "@/lib/press-ingest/classify";

// LLM 응답을 흉내내는 헬퍼 — OpenAI Chat Completion 응답 형식
function mockLlmResponse(json: Record<string, unknown>) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(json) } }],
    }),
  });
}

describe("classifyPressNews — confidence tier", () => {
  it("LLM 이 confidence='high' 응답하면 그대로 보존", async () => {
    mockLlmResponse({
      is_policy: true,
      program_type: "welfare",
      title: "x",
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
    });
    const r = await classifyPressNews({ title: "t", summary: null, body: null });
    expect(r.confidence).toBe("high");
  });

  it("LLM 이 confidence 누락하면 'low' fallback (보수적)", async () => {
    mockLlmResponse({
      is_policy: true,
      program_type: "welfare",
      title: "x",
      target: "",
      eligibility: "",
      benefits: "",
      apply_method: "",
      apply_url: null,
      body_urls: [],
      apply_start: null,
      apply_end: null,
      category: "주거",
    });
    const r = await classifyPressNews({ title: "t", summary: null, body: null });
    expect(r.confidence).toBe("low");
  });

  it("LLM 이 invalid confidence 값 응답하면 'low' fallback", async () => {
    mockLlmResponse({
      is_policy: true,
      program_type: "welfare",
      title: "x",
      target: "",
      eligibility: "",
      benefits: "",
      apply_method: "",
      apply_url: null,
      body_urls: [],
      apply_start: null,
      apply_end: null,
      category: "주거",
      confidence: "very-high",
    });
    const r = await classifyPressNews({ title: "t", summary: null, body: null });
    expect(r.confidence).toBe("low");
  });
});
