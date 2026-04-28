// ============================================================
// 광역 보도자료 → 정책 분류 (Anthropic Claude Haiku, fetch 직접 호출)
// ============================================================
// SDK 미설치 — Anthropic Messages API 를 fetch 로 직접 호출.
// 사장님이 trigger 만 호출 (자동 호출 X — 비용 통제).
//
// 환경변수 ANTHROPIC_API_KEY 미설정 시 throw → API route 가 503 반환.
// 비용: Haiku 4.5 ~$0.80 input / $4 output per 1M tok. 1건당 ~$0.003 추정.
// ============================================================

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

export type ClassifyResult = {
  /** 사용자가 직접 신청 가능한 정책 사업인가? false 면 나머지 필드 의미 X */
  is_policy: boolean;
  /** 정책 종류: welfare(복지) 또는 loan(대출) — unsure 면 사장님 판단 */
  program_type: "welfare" | "loan" | "unsure";
  /** 정책 공식 명칭 */
  title: string;
  /** 누가 받나 */
  target: string;
  /** 자격 상세 */
  eligibility: string;
  /** 무엇을 받나 (welfare 의 benefits 자리) */
  benefits: string;
  /** 어떻게 신청 */
  apply_method: string;
  /** 신청 URL (보도자료에 명시) — null 가능 */
  apply_url: string | null;
  /** 신청 시작 YYYY-MM-DD — null 가능 */
  apply_start: string | null;
  /** 신청 마감 YYYY-MM-DD — null 가능 */
  apply_end: string | null;
  /** welfare 카테고리: 생계·의료·양육·교육·취업·주거·문화·창업
   *  loan 카테고리: 정책자금·창업자금·소상공인·생계자금·주거자금·농어업·기타 */
  category: string;
  /** loan 일 때만 채움 */
  loan_amount?: string;
  interest_rate?: string;
  repayment_period?: string;
};

const PROMPT_TEMPLATE = `다음 광역도청 보도자료에서 일반 사용자가 직접 신청 가능한
"정책 사업" 정보를 추출해 JSON 으로 반환하세요.

판단 기준:
- 신청 가능: 지원금·바우처·수당 지급, 자격 충족 시 신청 가능 → is_policy=true
- 신청 불가: 회의·계획 발표·통계·인터뷰 → is_policy=false
- 정책 종류: 무상 지원/지급(welfare), 대출/융자(loan), 모호하면 unsure

JSON 형식 (다른 말 없이 JSON 만 출력):
{
  "is_policy": boolean,
  "program_type": "welfare"|"loan"|"unsure",
  "title": "정책 공식 명칭 (보도자료의 정확한 표현)",
  "target": "누가 받는가 (한 줄)",
  "eligibility": "자격 상세 (여러 줄 가능)",
  "benefits": "무엇을 받는가 (한 줄)",
  "apply_method": "어떻게 신청하는가",
  "apply_url": "보도자료에 명시된 신청 URL 또는 null",
  "apply_start": "YYYY-MM-DD 또는 null",
  "apply_end": "YYYY-MM-DD 또는 null",
  "category": "welfare 면 생계|의료|양육|교육|취업|주거|문화|창업 중 하나, loan 면 정책자금|창업자금|소상공인|생계자금|주거자금|농어업|기타 중 하나",
  "loan_amount": "대출 한도 (loan 일 때만, 예: '최대 5,000만원')",
  "interest_rate": "이자율 (loan 일 때만, 예: '연 2.0% 고정')",
  "repayment_period": "상환 기간 (loan 일 때만)"
}

is_policy=false 인 경우 나머지 필드는 빈 문자열 또는 null.

──────── 보도자료 ────────
[제목]
{TITLE}

[요약]
{SUMMARY}

[본문]
{BODY}
──────────────────────────`;

// 호출자 입력 길이 cap — 본문 너무 길면 토큰 비용 폭주
const MAX_BODY_CHARS = 4000;

export async function classifyPressNews(input: {
  title: string;
  summary: string | null;
  body: string | null;
}): Promise<ClassifyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 미설정 — Vercel 환경변수에 등록 필요");
  }

  const truncatedBody = (input.body ?? "").slice(0, MAX_BODY_CHARS);
  const prompt = PROMPT_TEMPLATE.replace("{TITLE}", input.title)
    .replace("{SUMMARY}", input.summary ?? "(요약 없음)")
    .replace("{BODY}", truncatedBody || "(본문 없음)");

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API 호출 실패 (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    content: { type: string; text: string }[];
  };
  const text = data.content?.[0]?.text;
  if (!text) {
    throw new Error("Anthropic 응답 비어있음");
  }

  // JSON 추출 — 모델이 코드블록 ```json 포함할 수도 있어 첫 { ~ 마지막 } 만 추출
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`JSON 파싱 실패: ${text.slice(0, 200)}`);
  }
  const jsonStr = text.slice(start, end + 1);

  let parsed: ClassifyResult;
  try {
    parsed = JSON.parse(jsonStr) as ClassifyResult;
  } catch (e) {
    throw new Error(
      `JSON.parse 실패: ${(e as Error).message} — ${jsonStr.slice(0, 200)}`,
    );
  }

  // 결과 보정 — 빈 string vs null 정규화
  return {
    is_policy: !!parsed.is_policy,
    program_type: ["welfare", "loan", "unsure"].includes(parsed.program_type)
      ? parsed.program_type
      : "unsure",
    title: parsed.title || input.title,
    target: parsed.target || "",
    eligibility: parsed.eligibility || "",
    benefits: parsed.benefits || "",
    apply_method: parsed.apply_method || "",
    apply_url: parsed.apply_url || null,
    apply_start: parsed.apply_start || null,
    apply_end: parsed.apply_end || null,
    category: parsed.category || "",
    loan_amount: parsed.loan_amount,
    interest_rate: parsed.interest_rate,
    repayment_period: parsed.repayment_period,
  };
}
