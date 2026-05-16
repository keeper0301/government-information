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
  improvements: string[];
}

const NEUTRAL: BlogQualityResult = {
  score: 3,
  needsReview: false,
  reason: "skipped",
  improvements: [],
};

export function getSeasonalMarketingFocus(now = new Date()): string {
  const month = now.getMonth() + 1;
  if (month <= 2) {
    return "연초 예산 확정, 신규 모집 시작, 청년·소상공인 정책 탐색 수요";
  }
  if (month <= 4) {
    return "입학·취업·이사철, 주거비·교육비·청년 취업 지원 수요";
  }
  if (month <= 6) {
    return "상반기 마감 전 신청, 가족·육아·근로장려·소상공인 운영자금 수요";
  }
  if (month <= 8) {
    return "여름방학·휴가철, 문화·교육·에너지 비용 절감 정책 수요";
  }
  if (month <= 10) {
    return "하반기 채용·창업·주거 안정, 예산 소진 전 신청 수요";
  }
  return "연말 마감, 다음 해 제도 변경, 미신청 지원금 점검 수요";
}

export function buildBlogQualityPrompt(
  post: { title: string; content: string },
  now = new Date(),
): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const seasonalFocus = getSeasonalMarketingFocus(now);
  return `다음 블로그 글의 발행 품질을 1~5 점으로 평가하세요.

현재 기준:
- 연도/월: ${year}년 ${month}월
- 한국 정책 콘텐츠 시즌 힌트: ${seasonalFocus}

평가 기준:
1 = 광고성·잘못된 정보·심각하게 읽기 어려움
2 = 내용 부실, 일부 명백한 오류, 또는 외부 채널 업로드 전 보강 필요
3 = 평균 (정상, 발행 가능)
4 = 검색 의도·정확성·가독성·CTA가 잘 정리됨
5 = 매우 정확하고, 최신성·신뢰·전환 요소가 모두 우수

반드시 함께 평가할 마케팅 품질:
- 제목이 사용자의 검색 의도와 현재 연도/시즌에 맞는가
- 대상·혜택/금액·신청 기간·제출 서류·공식 신청 경로가 충분히 분명한가
- 네이버 블로그/인스타 재활용 시 저장·검색·프로필 링크 CTA로 이어질 수 있는가
- 과장 없이 지역·소득·마감일에 따른 변동 가능성을 안내하는가
- 본문 첫 화면에서 핵심 조건을 빠르게 이해할 수 있는가

JSON 만 반환:
{ "score": 1~5 정수, "reason": "한 줄 근거 (한국어)", "improvements": ["수정 포인트 1", "수정 포인트 2"] }

제목: ${post.title}

본문 (앞 2400자):
${post.content.slice(0, 2400)}`;
}

export async function evaluateBlogQuality(
  post: {
    title: string;
    content: string;
  },
  opts: { failClosed?: boolean } = {},
): Promise<BlogQualityResult> {
  const prompt = buildBlogQualityPrompt(post);

  let parsed: { score?: number; reason?: string; improvements?: unknown };
  try {
    const text = await callLLM({ prompt, maxTokens: 220, jsonMode: true });
    parsed = parseJSONResponse<{ score?: number; reason?: string }>(text);
  } catch (e) {
    if (opts.failClosed) {
      return {
        score: 2,
        needsReview: true,
        reason: `품질 검수 실패: ${(e as Error).message.slice(0, 80)}`,
        improvements: [
          "품질 검수 LLM 호출을 재시도한 뒤 외부 채널 발행 여부를 판단하세요.",
        ],
      };
    }
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
    improvements: normalizeImprovements(parsed.improvements),
  };
}

function normalizeImprovements(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((item) => item.slice(0, 120));
}
