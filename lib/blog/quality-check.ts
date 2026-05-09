// ============================================================
// A1 — 블로그 발행 자동 품질 검수 (Claude Haiku 1~5점 평가).
// ============================================================
// 자동 발행된 블로그 글에 대해 LLM 이 광고성·오류·가독성을 평가.
// score ≤ 2 → admin_review_required=true. 사장님 /admin/blog 검수 큐.
// 비용: ~$0.005/글. 매일 10~30글 가정 → ~$0.1/일.

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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ...NEUTRAL, reason: "ANTHROPIC_API_KEY missing" };

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

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    return { ...NEUTRAL, reason: `network: ${(e as Error).message.slice(0, 60)}` };
  }

  if (!res.ok) return { ...NEUTRAL, reason: `http_${res.status}` };

  const data = (await res.json().catch(() => null)) as
    | { content?: Array<{ type: string; text: string }> }
    | null;
  const text = data?.content?.find((c) => c.type === "text")?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { ...NEUTRAL, reason: "no_json" };

  try {
    const parsed = JSON.parse(match[0]) as {
      score?: number;
      reason?: string;
    };
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
  } catch {
    return { ...NEUTRAL, reason: "json_parse_failed" };
  }
}
