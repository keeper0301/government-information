// ============================================================
// callLLM (OpenAI helper) 회귀 테스트 — 2026-06-03 fetch 타임아웃 추가 후속
// ============================================================
// fetch 를 mock 해 정상 응답·타임아웃(한국어)·API 오류·apiKey 누락·jsonMode·signal 전달 검증.
// (호출처 3곳은 callLLM 자체를 mock 하므로, callLLM 본체 회귀는 여기서만 커버.)
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callLLM, parseJSONResponse } from "@/lib/llm/text";

const okRes = (content: string) => ({
  ok: true,
  status: 200,
  text: async () => "",
  json: async () => ({ choices: [{ message: { content } }] }),
});

describe("callLLM", () => {
  const orig = process.env.OPENAI_API_KEY;
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.env.OPENAI_API_KEY = orig;
  });

  it("정상 응답 → message content 반환", async () => {
    global.fetch = vi.fn(async () => okRes("해설 텍스트")) as never;
    expect(await callLLM({ prompt: "테스트" })).toBe("해설 텍스트");
  });

  it("timeoutMs → fetch 에 AbortSignal 전달 (hang 격리)", async () => {
    let init: RequestInit | undefined;
    global.fetch = vi.fn(async (_u: unknown, i: RequestInit) => {
      init = i;
      return okRes("응답");
    }) as never;
    await callLLM({ prompt: "t", timeoutMs: 5000 });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("TimeoutError → 한국어 타임아웃 메시지로 throw", async () => {
    global.fetch = vi.fn(async () => {
      const e = new Error("aborted");
      e.name = "TimeoutError";
      throw e;
    }) as never;
    await expect(callLLM({ prompt: "t", timeoutMs: 1000 })).rejects.toThrow(
      /타임아웃 \(1000ms\)/,
    );
  });

  it("res.ok false → OpenAI API 오류 throw", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => "rate limit",
    })) as never;
    await expect(callLLM({ prompt: "t" })).rejects.toThrow(/OpenAI API 오류 429/);
  });

  it("apiKey 누락 → throw", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(callLLM({ prompt: "t" })).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it("jsonMode → body.response_format json_object 강제", async () => {
    let body: Record<string, unknown> = {};
    global.fetch = vi.fn(async (_u: unknown, i: RequestInit) => {
      body = JSON.parse(i.body as string);
      return okRes("{}");
    }) as never;
    await callLLM({ prompt: "t", jsonMode: true });
    expect(body.response_format).toEqual({ type: "json_object" });
  });
});

describe("parseJSONResponse", () => {
  it("유효 JSON 파싱", () => {
    expect(parseJSONResponse<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });
  it("잘못된 JSON → 한국어 throw", () => {
    expect(() => parseJSONResponse("not json")).toThrow(/JSON 파싱 실패/);
  });
});
