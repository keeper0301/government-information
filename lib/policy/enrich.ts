// ============================================================
// 다 묶음 — 정책 본문 자동 풍부화 (키워드 + 한 줄 요약, gpt-4o-mini).
// ============================================================
// LLM 1회 호출에 두 정보 동시 추출 — 비용 절약.
// ~$0.0004/건 (Haiku 의 ~1/7). 매일 30건 = ~$0.01/일.

import { callLLM, parseJSONResponse } from "@/lib/llm/text";

export interface PolicyEnrichInput {
  title: string;
  target?: string | null;
  eligibility?: string | null;
  benefits?: string | null;
  description?: string | null;
}

export interface PolicyEnrichResult {
  keywords: string[]; // 5~15개
  summaryShort: string; // 30~50자
}

const EMPTY: PolicyEnrichResult = { keywords: [], summaryShort: "" };

export async function enrichPolicy(
  input: PolicyEnrichInput,
): Promise<PolicyEnrichResult> {
  const text = [
    `제목: ${input.title}`,
    input.target ? `대상: ${input.target.slice(0, 200)}` : "",
    input.eligibility ? `자격: ${input.eligibility.slice(0, 300)}` : "",
    input.benefits ? `혜택: ${input.benefits.slice(0, 300)}` : "",
    input.description ? `설명: ${input.description.slice(0, 300)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `다음 정책 정보에서 검색 키워드와 카드용 한 줄 요약을 추출해.

키워드 규칙:
- 5~15개. 한국어 단어/짧은 구.
- 사용자가 검색할 법한 표현 (예: "청년", "월세지원", "서울", "전세대출")
- 정책 종류·지역·대상·혜택 핵심 위주

요약 규칙:
- 30~50자 한 줄. 누가/무엇을 받는가 가장 핵심.
- 마침표 X, 단순 명사구 또는 명사 + 조사.
- 예: "서울 청년 월세 최대 20만원 12개월 지원"

JSON 만 반환:
{"keywords":["...","..."],"summary_short":"..."}

정책 정보:
${text}`;

  let parsed: { keywords?: unknown; summary_short?: unknown };
  try {
    const responseText = await callLLM({ prompt, maxTokens: 400, jsonMode: true });
    parsed = parseJSONResponse(responseText);
  } catch {
    return EMPTY;
  }

  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords
        .filter((k): k is string => typeof k === "string" && k.length >= 1)
        .slice(0, 15)
    : [];
  const summaryShort =
    typeof parsed.summary_short === "string"
      ? parsed.summary_short.slice(0, 100)
      : "";
  return { keywords, summaryShort };
}
