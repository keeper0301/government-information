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

  it("adds current marketing context for Naver and Instagram reuse", async () => {
    const { generateBlogPost } = await import("@/lib/ai");

    await generateBlogPost({
      type: "welfare",
      title: "청년 월세 지원",
      description: "청년에게 월세를 지원하는 정책",
      apply_end: "2026-06-30",
    });

    const params = mockState.generateContentParams as {
      contents?: string;
    };
    expect(params.contents).toContain("[현재 마케팅 컨텍스트]");
    expect(params.contents).toContain("네이버 블로그와 인스타그램 카드/캡션");
    expect(params.contents).toContain("대상·금액·마감·신청 액션");
    expect(params.contents).toContain("저장/검색/프로필 링크 CTA");
    expect(params.contents).toContain("제출 서류 확인 포인트");
  });

  it("feeds recent quality-review learning hints into the generation prompt", async () => {
    const { generateBlogPost } = await import("@/lib/ai");

    await generateBlogPost({
      type: "welfare",
      title: "청년 월세 지원",
      description: "청년에게 월세를 지원하는 정책",
      qualityLearningHints: ["신청 기간을 첫 단락에 추가", "공식 신청 링크 확인 문구 추가"],
    });

    const params = mockState.generateContentParams as {
      contents?: string;
    };
    expect(params.contents).toContain("[최근 품질 검수 학습]");
    expect(params.contents).toContain("신청 기간을 첫 단락에 추가");
    expect(params.contents).toContain("공식 신청 링크 확인 문구 추가");
    expect(params.contents).toContain("같은 문제가 다시 나오지 않게");
  });

  it("feeds trend and external-channel learning hints into the generation prompt", async () => {
    const { generateBlogPost } = await import("@/lib/ai");

    await generateBlogPost({
      type: "welfare",
      title: "청년 월세 지원",
      description: "청년에게 월세를 지원하는 정책",
      trendLearningHints: [
        "최근 반응 카테고리: 청년(8), 주거(4)",
        "최근 반응 태그: 월세(5), 청년(4)",
      ],
    });

    const params = mockState.generateContentParams as {
      contents?: string;
    };
    expect(params.contents).toContain("[최근 반응/외부 채널 학습]");
    expect(params.contents).toContain("최근 반응 카테고리: 청년(8), 주거(4)");
    expect(params.contents).toContain("keepioo 내부 조회수·카테고리·태그와 네이버/인스타 발행 결과 기반");
    expect(params.contents).toContain("자연스럽게 맞는 키워드·표현만 반영");
  });
});
