// ============================================================
// 뉴스 자동 모더레이션 분류 (gpt-4o-mini via lib/llm/text)
// ============================================================
// /api/cron/news-classify 가 cron 6회/일 호출. 미분류 뉴스를 LLM 으로 판별.
//
// 판별 영역 (3개):
//   1) advertorial — 광고성 글 (할인·이벤트·쿠폰 등 명시적 마케팅) → 자동 hide
//   2) copyright_risk — 저작권 위반 의심 (특정 매체 전문 복붙·번역) → 자동 hide
//   3) confidence — 0.7 이상만 자동 hide 적용
//
// 비용: gpt-4o-mini ~$0.0004/건 (Haiku 4.5 의 ~1/7). 일 1,200건 = 월 ~$15.
// ============================================================

import { callLLM, parseJSONResponse } from "@/lib/llm/text";

export type NewsClassifyResult = {
  /** 광고성 단정 — 즉시 자동 hide */
  is_advertorial: boolean;
  /** 저작권 위반 의심 — 즉시 자동 hide */
  is_copyright_risk: boolean;
  /** 신뢰도 (0.0~1.0) — 0.7 미만이면 visible 유지 (안전 default) */
  confidence: number;
  /** 한 줄 사유 (사장님이 hidden_reason 으로 보게 됨) */
  reason: string;
};

const PROMPT_TEMPLATE = `다음 정책 뉴스 글이 keepioo (정부 정책 정보 사이트) 사용자에게
적절한지 판별하세요. JSON 으로만 출력.

판별 기준:
1) is_advertorial=true: 광고성 글 (할인·이벤트·쿠폰·체험단·제품 추천 등 명시적 마케팅).
   ❌ 정책 발표·신청 안내·통계는 광고성 아님 (false).
2) is_copyright_risk=true: 저작권 위반 의심 (특정 매체 기사 전문 복붙·번역으로 보이는
   경우). 공식 보도자료·정부 발표는 copyright_risk 아님 (false).
3) confidence: 0.0~1.0. 명확하면 0.9+, 애매하면 0.5~0.7. 0.7 미만은 자동 hide 안 됨.
4) reason: 한 줄 사유 (사장님 운영 화면에 표시). 정상이면 "정상".

JSON 형식:
{
  "is_advertorial": boolean,
  "is_copyright_risk": boolean,
  "confidence": 숫자(0.0~1.0),
  "reason": "한 줄 사유"
}

──────── 정책 뉴스 ────────
[제목]
{TITLE}

[출처]
{SOURCE}

[본문 (앞 1500자)]
{BODY}
`;

export async function classifyNewsForModeration(input: {
  title: string;
  source: string | null;
  body: string | null;
}): Promise<NewsClassifyResult> {
  const prompt = PROMPT_TEMPLATE.replace("{TITLE}", input.title || "(제목 없음)")
    .replace("{SOURCE}", input.source || "(출처 미상)")
    .replace("{BODY}", (input.body ?? "(본문 없음)").slice(0, 1500));

  const text = await callLLM({ prompt, maxTokens: 300, jsonMode: true });
  return validateResult(parseJSONResponse(text));
}

function validateResult(parsed: unknown): NewsClassifyResult {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("응답이 객체 아님");
  }
  const obj = parsed as Record<string, unknown>;

  const is_advertorial = Boolean(obj.is_advertorial);
  const is_copyright_risk = Boolean(obj.is_copyright_risk);
  const confidence =
    typeof obj.confidence === "number" && obj.confidence >= 0 && obj.confidence <= 1
      ? obj.confidence
      : 0.5; // 비정상 응답 → 보수적 default (자동 hide 안 됨)
  const reason =
    typeof obj.reason === "string" ? obj.reason.slice(0, 200) : "정상";

  return { is_advertorial, is_copyright_risk, confidence, reason };
}

/**
 * confidence 임계치 — 이상이어야 자동 hide 적용.
 * 0.7 = 70% — Haiku 가 "확신" 표시한 경우만 자동 hide.
 * 70% 미만 = 사장님 어드민에서 직접 확인.
 */
export const AUTO_HIDE_CONFIDENCE_THRESHOLD = 0.7;

export type AutoModerationDecision =
  | { action: "hide"; reason: string }
  | { action: "keep"; reason: string };

/**
 * classify 결과 → 운영 결정.
 * confidence 가 임계치 이상이고 광고성·저작권 의심 명백할 때만 hide.
 */
export function decideAutoModeration(
  result: NewsClassifyResult,
): AutoModerationDecision {
  if (
    result.confidence >= AUTO_HIDE_CONFIDENCE_THRESHOLD &&
    result.is_advertorial
  ) {
    return { action: "hide", reason: `자동: 광고성 (${result.reason})` };
  }
  if (
    result.confidence >= AUTO_HIDE_CONFIDENCE_THRESHOLD &&
    result.is_copyright_risk
  ) {
    return { action: "hide", reason: `자동: 저작권 의심 (${result.reason})` };
  }
  return { action: "keep", reason: result.reason };
}
