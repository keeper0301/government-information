import { describe, expect, it, vi } from "vitest";
import {
  buildBlogQualityPrompt,
  evaluateBlogQuality,
  getSeasonalMarketingFocus,
} from "@/lib/blog/quality-check";

vi.mock("@/lib/llm/text", () => ({
  callLLM: vi.fn(),
  parseJSONResponse: vi.fn((text: string) => JSON.parse(text)),
}));

const { callLLM } = await import("@/lib/llm/text");

describe("getSeasonalMarketingFocus", () => {
  it("상반기 마감 시즌 힌트를 반환한다", () => {
    expect(getSeasonalMarketingFocus(new Date("2026-05-16T00:00:00+09:00"))).toContain(
      "상반기 마감",
    );
  });

  it("연말에는 마감과 다음 해 제도 변경 힌트를 반환한다", () => {
    const focus = getSeasonalMarketingFocus(new Date("2026-12-01T00:00:00+09:00"));
    expect(focus).toContain("연말 마감");
    expect(focus).toContain("다음 해 제도 변경");
  });
});

describe("buildBlogQualityPrompt", () => {
  it("현재 연도/월과 시즌 힌트를 포함한다", () => {
    const prompt = buildBlogQualityPrompt(
      {
        title: "2026년 청년 월세 지원",
        content: "<p>청년 월세 지원 대상과 신청 방법을 정리합니다.</p>",
      },
      new Date("2026-05-16T00:00:00+09:00"),
    );

    expect(prompt).toContain("2026년");
    expect(prompt).toContain("5월");
    expect(prompt).toContain("한국 정책 콘텐츠 시즌 힌트");
    expect(prompt).toContain("상반기 마감");
  });

  it("외부 채널 업로드 전 마케팅 품질 체크리스트를 포함한다", () => {
    const prompt = buildBlogQualityPrompt(
      {
        title: "2026년 소상공인 정책자금 신청",
        content: "<p>정책자금 신청 조건 안내</p>",
      },
      new Date("2026-09-01T00:00:00+09:00"),
    );

    expect(prompt).toContain("검색 의도");
    expect(prompt).toContain("대상·혜택/금액·신청 기간·제출 서류·공식 신청 경로");
    expect(prompt).toContain("네이버 블로그/인스타 재활용");
    expect(prompt).toContain("저장·검색·프로필 링크 CTA");
    expect(prompt).toContain("지역·소득·마감일에 따른 변동 가능성");
    expect(prompt).toContain("improvements");
  });

  it("본문은 2400자로 잘라 LLM 비용과 지연을 제한한다", () => {
    const content = "가".repeat(3000);
    const prompt = buildBlogQualityPrompt(
      {
        title: "긴 글",
        content,
      },
      new Date("2026-05-16T00:00:00+09:00"),
    );

    expect(prompt).toContain("가".repeat(2400));
    expect(prompt).not.toContain("가".repeat(2401));
  });
});

describe("evaluateBlogQuality", () => {
  it("기본 검수 모드는 LLM 실패 시 발행 파이프라인을 막지 않는다", async () => {
    vi.mocked(callLLM).mockRejectedValueOnce(new Error("temporary llm outage"));

    const result = await evaluateBlogQuality({
      title: "청년 월세 지원",
      content: "<p>본문</p>",
    });

    expect(result.score).toBe(3);
    expect(result.needsReview).toBe(false);
    expect(result.reason).toContain("temporary llm outage");
  });

  it("외부 발행 직전 검수는 LLM 실패 시 fail-closed 로 보류한다", async () => {
    vi.mocked(callLLM).mockRejectedValueOnce(new Error("temporary llm outage"));

    const result = await evaluateBlogQuality(
      {
        title: "청년 월세 지원",
        content: "<p>본문</p>",
      },
      { failClosed: true },
    );

    expect(result.score).toBe(2);
    expect(result.needsReview).toBe(true);
    expect(result.reason).toContain("품질 검수 실패");
    expect(result.improvements[0]).toContain("재시도");
  });

  it("LLM 개선 포인트를 최대 3개까지 정규화한다", async () => {
    vi.mocked(callLLM).mockResolvedValueOnce(
      JSON.stringify({
        score: 2,
        reason: "신청 기간과 CTA가 약함",
        improvements: [
          "신청 기간을 첫 단락에 추가",
          "공식 신청 링크 확인 문구 추가",
          "인스타 저장 CTA 추가",
          "네 번째 항목은 버림",
        ],
      }),
    );

    const result = await evaluateBlogQuality({
      title: "청년 월세 지원",
      content: "<p>본문</p>",
    });

    expect(result.score).toBe(2);
    expect(result.needsReview).toBe(true);
    expect(result.improvements).toEqual([
      "신청 기간을 첫 단락에 추가",
      "공식 신청 링크 확인 문구 추가",
      "인스타 저장 CTA 추가",
    ]);
  });
});
