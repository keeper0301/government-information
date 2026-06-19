import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  constructorOptions: undefined as unknown,
  generateContentParams: undefined as unknown,
  // OpenAI 비상 우회 테스트용
  geminiShouldThrow: false as boolean,
  callLLMArgs: undefined as unknown,
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function MockGoogleGenAI(options) {
    mockState.constructorOptions = options;
    return {
      models: {
        generateContent: vi.fn().mockImplementation(async (params) => {
          mockState.generateContentParams = params;
          // Gemini 장애 시뮬레이션 (선불 크레딧 소진 등)
          if (mockState.geminiShouldThrow) {
            throw new Error("got status: 429 Too Many Requests. RESOURCE_EXHAUSTED");
          }
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

// OpenAI 비상 우회(lib/llm/text 의 callLLM) mock — 호출 인자 기록 + 백업 글 반환
vi.mock("@/lib/llm/text", () => ({
  callLLM: vi.fn().mockImplementation(async (opts) => {
    mockState.callLLMArgs = opts;
    return JSON.stringify({
      title: "OpenAI 백업 글 제목",
      meta_description: "OpenAI 백업으로 생성된 정책 안내 글입니다. 자격과 신청 방법을 한눈에 정리했습니다.",
      content: "<p>백업 본문</p>",
      category: "청년",
      tags: ["청년"],
      faqs: [],
    });
  }),
}));

describe("generateBlogPost", () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.constructorOptions = undefined;
    mockState.generateContentParams = undefined;
    mockState.geminiShouldThrow = false;
    mockState.callLLMArgs = undefined;
    process.env.GEMINI_API_KEY = "test-key";
    process.env.OPENAI_API_KEY = "test-openai-key";
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

  it("keeps the publish prompt blog-first and blocks SNS-style copy", async () => {
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
    expect(params.contents).toContain("신뢰성 있는 안내문");
    expect(params.contents).toContain("SNS식 구어체, 과장 CTA, 클릭 유도 문구를 섞지 마세요");
    expect(params.contents).toContain("대상·금액·마감·신청 액션");
    expect(params.contents).toContain("제출 서류 확인 포인트");
    expect(params.contents).toContain("content 는 반드시 <h2>가 아니라 <p>로 시작하세요");
    expect(params.contents).not.toContain("저장/검색/프로필 링크 CTA");
    expect(params.contents).not.toContain("인스타그램 카드/캡션");
  });

  it("adds Naver reference-style layout guidance to the generation prompt", async () => {
    const { generateBlogPost } = await import("@/lib/ai");

    await generateBlogPost({
      type: "welfare",
      title: "청년 창업 지원",
      description: "청년 창업기업에 사업화 자금을 지원하는 정책",
    });

    const params = mockState.generateContentParams as {
      config?: { systemInstruction?: string };
    };
    const systemInstruction = params.config?.systemInstruction ?? "";
    expect(systemInstruction).toContain("참고글(cgc0904/224279232682)처럼 단순하고 읽기 쉬운 흐름");
    expect(systemInstruction).toContain("짧은 정의/요약 문단 2개 → 가운데 CTA → 본문 상세 섹션");
    expect(systemInstruction).toContain("자동 생성 티 나는 \"검색 핵심 정보\", \"요약 답변\" 같은 반복 제목 남발 금지");
    expect(systemInstruction).toContain("SEO + AEO + GEO");
    expect(systemInstruction).toContain("H2=30px 굵은 회색 좌측바, H3=21px 작은 좌측바");
    expect(systemInstruction).toContain("featured snippet/answer box");
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

  it("Gemini 실패 시 OpenAI(gpt-4o)로 비상 우회한다", async () => {
    mockState.geminiShouldThrow = true;
    const { generateBlogPost } = await import("@/lib/ai");

    const result = await generateBlogPost({
      type: "welfare",
      title: "청년 월세 지원",
      description: "청년에게 월세를 지원하는 정책",
    });

    // OpenAI(callLLM)로 폴백 — gpt-4o + jsonMode, system+user 합쳐 전달
    expect(mockState.callLLMArgs).toBeDefined();
    const args = mockState.callLLMArgs as {
      model?: string;
      jsonMode?: boolean;
      prompt?: string;
    };
    expect(args.model).toBe("gpt-4o");
    expect(args.jsonMode).toBe(true);
    expect(args.prompt).toContain("[정책 데이터]");
    // OpenAI 백업 결과가 반환됨 + provider 표시 = openai (조기경보·비용 가시화용)
    expect(result.title).toBe("OpenAI 백업 글 제목");
    expect(result.category).toBe("청년");
    expect(result._provider).toBe("openai");
  });

  it("Gemini 정상이면 OpenAI 백업을 호출하지 않는다", async () => {
    const { generateBlogPost } = await import("@/lib/ai");

    const result = await generateBlogPost({
      type: "welfare",
      title: "청년 월세 지원",
      description: "청년에게 월세를 지원하는 정책",
    });

    // Gemini 정상 → 폴백 미호출, Gemini 결과 반환, provider = gemini
    expect(mockState.callLLMArgs).toBeUndefined();
    expect(result.title).toBe("2026년 청년 정책 지원금 신청 조건과 혜택 정리");
    expect(result._provider).toBe("gemini");
  });
});
