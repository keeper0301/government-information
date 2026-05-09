// ============================================================
// A1 — 블로그 발행 자동 품질 검수 (gpt-4o-mini 1~5점 평가).
// ============================================================
// 자동 발행된 블로그 글에 대해 LLM 이 광고성·오류·가독성을 평가.
// score ≤ 2 → admin_review_required=true. 사장님 /admin/blog 검수 큐.
// 비용: ~$0.0007/글 (Haiku 의 ~1/7). 매일 10~30글 → ~$0.02/일.

import { callLLM, parseJSONResponse } from "@/lib/llm/text";

export interface BlogQualityResult {
  score: number; // 1~5 (1=잘못, 5=우수)
  needsReview: boolean; // score <= 2
  reason: string;
}

const NEUTRAL: BlogQualityResult = {
  score: 3,
  needsReview: false,
  reason: "skipped",
};

export async function evaluateBlogQuality(post: {
  title: string;
  content: string;
}): Promise<BlogQualityResult> {
  const prompt = `다음 블로그 글의 품질을 1~5 점으로 평가하세요.

평가 기준:
1 = 광고성·잘못된 정보·심각하게 읽기 어려움
2 = 내용 부실 또는 일부 명백한 오류
3 = 평균 (정상, 발행 가능)
4 = 잘 정리됨 (가독성·정확성 우수)
5 = 매우 정확하고 가독성 매우 우수

JSON 만 반환:
{ "score": 1~5 정수, "reason": "한 줄 근거 (한국어)" }

제목: ${post.title}

본문 (앞 2000자):
${post.content.slice(0, 2000)}`;

  let parsed: { score?: number; reason?: string };
  try {
    const text = await callLLM({ prompt, maxTokens: 150, jsonMode: true });
    parsed = parseJSONResponse<{ score?: number; reason?: string }>(text);
  } catch (e) {
    return { ...NEUTRAL, reason: (e as Error).message.slice(0, 80) };
  }

  const rawScore =
    typeof parsed.score === "number" && Number.isInteger(parsed.score)
      ? parsed.score
      : 3;
  const score = Math.max(1, Math.min(5, rawScore));
  return {
    score,
    needsReview: score <= 2,
    reason: (parsed.reason || "").slice(0, 200),
  };
}
