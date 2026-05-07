// ============================================================
// 뉴스 자동 모더레이션 분류 (Anthropic Claude Haiku)
// ============================================================
// /api/cron/news-classify 가 매시간 호출. 미분류 뉴스를 LLM 으로 판별.
// press-ingest/classify.ts 와 동일 패턴 (SDK 미설치, fetch 직접).
//
// 판별 영역 (3개):
//   1) advertorial — 광고성 글 (할인·이벤트·쿠폰 등 명시적 마케팅)
//      → 자동 hide
//   2) copyright_risk — 저작권 위반 의심 (특정 매체 전문 복붙·번역)
//      → 자동 hide
//   3) topic — 사용자 검색에 도움될 카테고리 (이번 단계는 hide 결정만)
//
// 비용: Haiku 4.5 ~$0.003/건. 일 30~100건 = 월 ~$10. ANTHROPIC_API_KEY 활용.
// ============================================================

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 환경변수 누락");
  }

  const prompt = PROMPT_TEMPLATE.replace("{TITLE}", input.title || "(제목 없음)")
    .replace("{SOURCE}", input.source || "(출처 미상)")
    .replace("{BODY}", (input.body ?? "(본문 없음)").slice(0, 1500));

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API 오류 ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json: unknown = await res.json().catch(() => ({}));
  const text = extractMessageText(json);
  if (!text) throw new Error("Anthropic 응답에서 텍스트 추출 실패");

  // JSON 추출 — Claude 가 가끔 앞뒤에 설명 붙임. 첫 { ... } 만 파싱.
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) throw new Error(`JSON 형식 응답 아님: ${text.slice(0, 200)}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`JSON 파싱 실패: ${(e as Error).message}`);
  }

  return validateResult(parsed);
}

function extractMessageText(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const content = (json as Record<string, unknown>).content;
  if (!Array.isArray(content) || content.length === 0) return null;
  const first = content[0];
  if (!first || typeof first !== "object") return null;
  const text = (first as Record<string, unknown>).text;
  return typeof text === "string" ? text : null;
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
