import { beforeEach, describe, expect, it, vi } from "vitest";

// 2026-05-17 G5 — Gemini → OpenAI 마이그 후 callLLMWithUsage 만 mock.
// 기존 @google/genai mock 폐기 (이제 사용 안 함).
const mockState = vi.hoisted(() => ({
  lastOptions: undefined as unknown,
}));

vi.mock("@/lib/llm/text", () => ({
  callLLMWithUsage: vi.fn().mockImplementation(async (opts: unknown) => {
    mockState.lastOptions = opts;
    return {
      text: JSON.stringify({
        title: "2026년 청년 정책 지원금 신청 조건과 혜택 정리",
        meta_description: "청년 정책 지원금 신청 대상과 혜택, 신청 방법을 한눈에 정리했습니다. 자격 조건과 마감일을 확인하고 공식 신청 페이지에서 최신 내용을 확인하세요.",
        content: "<p>본문</p>",
        category: "청년",
        tags: ["청년", "지원금", "정책"],
        faqs: [],
      }),
      usage: { promptTokens: 100, candidatesTokens: 200, totalTokens: 300 },
    };
  }),
}));

type CapturedOptions = {
  system?: string;
  prompt?: string;
  model?: string;
  maxTokens?: number;
  jsonMode?: boolean;
  temperature?: number;
};

describe("generateBlogPost (OpenAI 마이그 후)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.lastOptions = undefined;
  });

  it("OpenAI gpt-4o-mini + jsonMode + temperature 0.85 + 페르소나 system instruction", async () => {
    const { generateBlogPost } = await import("@/lib/ai");

    await generateBlogPost({
      type: "welfare",
      title: "청년 지원 정책",
      description: "청년에게 생활비를 지원하는 정책",
    });

    const opts = mockState.lastOptions as CapturedOptions;
    expect(opts.model).toBe("gpt-4o-mini");
    expect(opts.jsonMode).toBe(true);
    expect(opts.temperature).toBe(0.85);
    expect(opts.maxTokens).toBe(7168);
    // 페르소나 4종 (guide/social_worker/fact_checker/experienced_user) 중 하나의 intro 포함
    expect(opts.system).toMatch(
      /당신은 (정부 복지·대출|동주민센터|공공 데이터|본인과 가족)/,
    );
    // 공통 SYSTEM_INSTRUCTION_BODY 의 핵심 룰 포함
    expect(opts.system).toContain("Google AdSense");
  });

  it("user prompt 에 마케팅 컨텍스트 (네이버·인스타 재활용) 포함", async () => {
    const { generateBlogPost } = await import("@/lib/ai");

    await generateBlogPost({
      type: "welfare",
      title: "청년 월세 지원",
      description: "청년에게 월세를 지원하는 정책",
      apply_end: "2026-06-30",
    });

    const opts = mockState.lastOptions as CapturedOptions;
    expect(opts.prompt).toContain("[현재 마케팅 컨텍스트]");
    expect(opts.prompt).toContain("네이버 블로그와 인스타그램 카드/캡션");
    expect(opts.prompt).toContain("대상·금액·마감·신청 액션");
    expect(opts.prompt).toContain("저장/검색/프로필 링크 CTA");
    expect(opts.prompt).toContain("제출 서류 확인 포인트");
  });

  it("user prompt 에 qualityLearningHints 가 [최근 품질 검수 학습] 블록으로 주입", async () => {
    const { generateBlogPost } = await import("@/lib/ai");

    await generateBlogPost({
      type: "welfare",
      title: "청년 월세 지원",
      description: "청년에게 월세를 지원하는 정책",
      qualityLearningHints: ["신청 기간을 첫 단락에 추가", "공식 신청 링크 확인 문구 추가"],
    });

    const opts = mockState.lastOptions as CapturedOptions;
    expect(opts.prompt).toContain("[최근 품질 검수 학습]");
    expect(opts.prompt).toContain("신청 기간을 첫 단락에 추가");
    expect(opts.prompt).toContain("공식 신청 링크 확인 문구 추가");
    expect(opts.prompt).toContain("같은 문제가 다시 나오지 않게");
  });

  it("user prompt 에 trendLearningHints 가 [최근 반응/외부 채널 학습] 블록으로 주입", async () => {
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

    const opts = mockState.lastOptions as CapturedOptions;
    expect(opts.prompt).toContain("[최근 반응/외부 채널 학습]");
    expect(opts.prompt).toContain("최근 반응 카테고리: 청년(8), 주거(4)");
    expect(opts.prompt).toContain("keepioo 내부 조회수·카테고리·태그와 네이버/인스타 발행 결과 기반");
    expect(opts.prompt).toContain("자연스럽게 맞는 키워드·표현만 반영");
  });

  it("LLM usage 가 GeneratedPost._usage 에 그대로 보존 (autonomous hub 비용 추적)", async () => {
    const { generateBlogPost } = await import("@/lib/ai");

    const post = await generateBlogPost({
      type: "welfare",
      title: "청년 지원 정책",
      description: "청년에게 생활비를 지원하는 정책",
    });

    expect(post._usage).toEqual({
      promptTokens: 100,
      candidatesTokens: 200,
      totalTokens: 300,
    });
  });
});
