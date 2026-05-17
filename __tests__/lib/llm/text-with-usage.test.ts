import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callLLMWithUsage } from "@/lib/llm/text";

// callLLMWithUsage 단위 테스트 (5/17 G5 신규).
// generateBlogPost 마이그 의존이라 system 분리·jsonMode·temperature·usage 보존 회귀 방어.

describe("callLLMWithUsage", () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("system 옵션이 messages 배열의 첫 system role 로 전송된다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await callLLMWithUsage({
      system: "당신은 작가입니다",
      prompt: "글 써줘",
    });

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body);
    expect(body.messages).toEqual([
      { role: "system", content: "당신은 작가입니다" },
      { role: "user", content: "글 써줘" },
    ]);
  });

  it("system 없으면 messages 는 user 하나만", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await callLLMWithUsage({ prompt: "hi" });
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body);
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("jsonMode + temperature 옵션이 body 에 전달", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "{}" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await callLLMWithUsage({
      prompt: "test",
      jsonMode: true,
      temperature: 0.85,
      model: "gpt-4o-mini",
      maxTokens: 1024,
    });

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.temperature).toBe(0.85);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.max_tokens).toBe(1024);
  });

  it("OpenAI usage 가 Gemini 호환 형식 (promptTokens/candidatesTokens/totalTokens) 으로 변환", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
      }),
    }) as unknown as typeof fetch;

    const result = await callLLMWithUsage({ prompt: "test" });
    expect(result.text).toBe("ok");
    expect(result.usage).toEqual({
      promptTokens: 100,
      candidatesTokens: 200,
      totalTokens: 300,
    });
  });

  it("OPENAI_API_KEY 미설정 시 한국어 에러 throw", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(callLLMWithUsage({ prompt: "x" })).rejects.toThrow(
      "OPENAI_API_KEY 환경변수 누락",
    );
  });

  it("API 오류 응답 시 한국어 에러 + status 포함", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limit",
    }) as unknown as typeof fetch;

    await expect(callLLMWithUsage({ prompt: "x" })).rejects.toThrow(/OpenAI API 오류 429/);
  });

  it("usage 누락 응답 시 0 fallback (cost 추적 graceful)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    }) as unknown as typeof fetch;

    const result = await callLLMWithUsage({ prompt: "x" });
    expect(result.usage).toEqual({ promptTokens: 0, candidatesTokens: 0, totalTokens: 0 });
  });
});
