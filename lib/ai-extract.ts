// ============================================================
// LLM 기반 구조화 추출 — 공고 description → 핵심 필드 JSON
// ============================================================
// 스크래퍼가 긁어온 description (공고 본문 텍스트) 에서
// 자격 요건·지원 내용·한도·금리·신청 방법·필요 서류 등을
// Gemini 로 추출해 DB 에 채운다.
//
// 스크래퍼 확장(각 소스 HTML 파싱 규칙 개별화) 대신 이 경로를 쓰는 이유
//   - 15개 소스 × 각기 다른 HTML 구조 → 개별 파서 유지 비용 큼
//   - description 텍스트만 있으면 LLM 이 구조 차이 흡수
//   - Gemini 2.5 Flash 무료 티어 일 1500회 → 충분한 처리량
// ============================================================

import { GoogleGenAI } from "@google/genai";

// 추출된 필드 — DB 컬럼과 이름 일치 (update 시 바로 매핑)
export type ExtractedFields = {
  eligibility: string | null;       // 자격 요건
  benefits: string | null;          // 혜택·지원 내용 (welfare)
  loan_amount: string | null;       // 대출·지원 한도 (loan)
  interest_rate: string | null;     // 금리 (loan)
  repayment_period: string | null;  // 상환 조건 (loan)
  apply_method: string | null;      // 신청 방법
  required_documents: string | null; // 필요 서류
};

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (_ai) return _ai;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
  _ai = new GoogleGenAI({ apiKey: key });
  return _ai;
}

// 시스템 지침 — 추출 품질의 핵심. "추측 금지" 원칙을 강하게 명시.
const SYSTEM_INSTRUCTION = `당신은 한국 정부 복지·대출 정책 공고 텍스트에서 구조화 정보를 추출하는 전문 파서입니다.

## 원칙 (절대 준수)
1. 본문에 **명시된 정보만** 추출. 추측·창작·일반 상식 보강 금지.
2. 본문에 해당 항목이 없으면 반드시 **null** (JSON null, 문자열 "null" 금지).
3. 각 필드는 한국어 자연 문장 1~3줄, **500자 이내**로 간결 정리.
4. 금액은 "최대 1,000만원", 금리는 "연 2.5%", 상환은 "최대 10년 (거치 2년 포함)" 같이 정형화.
5. 신청 방법은 **온라인·오프라인·방문처** 포함해 구체적으로.

## 필드 의미
- eligibility: 지원 대상의 자격·조건 (예: "만 19~34세 청년, 무주택자")
- benefits: 지원 내용·혜택 (복지용. 예: "월 최대 20만원 월세 지원, 최장 12개월")
- loan_amount: 대출·보증 한도 (대출용. 복지면 null)
- interest_rate: 금리·이율 (대출용. 복지면 null)
- repayment_period: 상환·거치 기간 (대출용. 복지면 null)
- apply_method: 신청 채널·절차
- required_documents: 제출 서류 목록

## 출력 — JSON 객체 1개만 (마크다운 코드블록·설명문 금지)
{
  "eligibility": "...或 null",
  "benefits": "...或 null",
  "loan_amount": "...或 null",
  "interest_rate": "...或 null",
  "repayment_period": "...或 null",
  "apply_method": "...或 null",
  "required_documents": "...或 null"
}`;

// 공고 본문에서 구조화 필드 추출
// - description 이 너무 짧으면 (80자 미만) 호출 생략 — 추출할 정보 없음
// - 실패 시 throw (상위에서 catch 해 per-row 실패 처리)
export async function extractFieldsFromText(
  title: string,
  description: string,
  category: "welfare" | "loan",
): Promise<ExtractedFields> {
  const ai = getAI();

  const userPrompt = `다음 공고에서 구조화 정보를 추출해 JSON 으로 출력하세요.
본문에 없는 항목은 반드시 null.

[공고]
분류: ${category === "welfare" ? "복지·수혜성" : "대출·지원금"}
제목: ${title}
본문:
${description.substring(0, 4000)}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userPrompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      temperature: 0.1, // 추출 작업이라 낮게 (창의성 불필요)
      maxOutputTokens: 1024,
    },
  });

  const raw = response.text;
  if (!raw) throw new Error("Gemini 응답이 비어있습니다.");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "파싱 실패";
    throw new Error(`Gemini JSON 파싱 실패: ${msg} — 원본 앞 300자: ${raw.slice(0, 300)}`);
  }

  // 값 정규화: 빈 문자열·"null"·공백만 → null, 길이 제한
  const trim = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (!t) return null;
    if (t.toLowerCase() === "null") return null;
    return t.substring(0, 500);
  };

  return {
    eligibility: trim(parsed.eligibility),
    benefits: trim(parsed.benefits),
    loan_amount: trim(parsed.loan_amount),
    interest_rate: trim(parsed.interest_rate),
    repayment_period: trim(parsed.repayment_period),
    apply_method: trim(parsed.apply_method),
    required_documents: trim(parsed.required_documents),
  };
}
