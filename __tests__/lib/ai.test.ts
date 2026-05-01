import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  constructorOptions: undefined as unknown,
  generateContentParams: undefined as unknown,
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function MockGoogleGenAI(options) {
    mockState.constructorOptions = options;
    return {
      models: {
        generateContent: vi.fn().mockImplementation(async (params) => {
          mockState.generateContentParams = params;
          return {
            text: JSON.stringify({
              title: "2026년 청년 정책 지원금 신청 조건과 혜택 정리",
              meta_description: "청년 정책 지원금 신청 대상과 혜택, 신청 방법을 한눈에 정리했습니다. 자격 조건과 마감일을 확인하고 공식 신청 페이지에서 최신 내용을 확인하세요.",
              content: "<p>본문</p>",
              category: "청년",
              tags: ["청년", "지원금", "정책"],
              faqs: [],
            }),
          };
        }),
      },
    };
  }),
}));

describe("generateBlogPost", () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.constructorOptions = undefined;
    mockState.generateContentParams = undefined;
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("configures Gemini calls to stay within the publish route timeout", async () => {
    const { generateBlogPost } = await import("@/lib/ai");

    await generateBlogPost({
      type: "welfare",
      title: "청년 지원 정책",
      description: "청년에게 생활비를 지원하는 정책",
    });

    expect(mockState.constructorOptions).toMatchObject({
      apiKey: "test-key",
      httpOptions: {
        timeout: 45000,
        retryOptions: { attempts: 1 },
      },
    });
    expect(mockState.generateContentParams).toMatchObject({
      config: {
        thinkingConfig: {
          thinkingBudget: 0,
          includeThoughts: false,
        },
      },
    });
  });
});
