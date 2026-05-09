// ============================================================
// A4 — 카테고리 누락 정책 LLM 자동 분류 (gpt-4o-mini).
// ============================================================
// welfare 카테고리: 생계 / 의료 / 양육 / 교육 / 취업 / 주거 / 문화 / 창업
// loan 카테고리:    정책자금 / 창업자금 / 소상공인 / 생계자금 / 주거자금 / 농어업 / 기타
// 정책 1건당 ~$0.0004 (Haiku 의 ~1/7). cron 마다 50건 처리 = ~$0.02/일.

import { callLLM, parseJSONResponse } from "@/lib/llm/text";

const WELFARE_CATEGORIES = [
  "생계", "의료", "양육", "교육", "취업", "주거", "문화", "창업",
] as const;

const LOAN_CATEGORIES = [
  "정책자금", "창업자금", "소상공인", "생계자금", "주거자금", "농어업", "기타",
] as const;

export type ProgramTable = "welfare_programs" | "loan_programs";

export interface CategoryClassifyInput {
  table: ProgramTable;
  title: string;
  target?: string | null;
  eligibility?: string | null;
  benefits?: string | null;
}

export interface CategoryClassifyResult {
  category: string | null; // null 이면 분류 실패 (사장님 검토 큐 유지)
  reason: string;
}

export async function classifyCategory(
  input: CategoryClassifyInput,
): Promise<CategoryClassifyResult> {
  const allowed =
    input.table === "welfare_programs" ? WELFARE_CATEGORIES : LOAN_CATEGORIES;

  const programText = [
    `제목: ${input.title}`,
    input.target ? `대상: ${input.target.slice(0, 200)}` : "",
    input.eligibility ? `자격: ${input.eligibility.slice(0, 200)}` : "",
    input.benefits ? `혜택: ${input.benefits.slice(0, 200)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `다음 정책의 카테고리를 분류하세요. 아래 후보 중 하나만 선택:
${allowed.join(" / ")}

JSON 만 반환하세요:
{ "category": "선택한 카테고리", "reason": "한 줄 근거" }

확신 없으면 category=null.

정책:
${programText}`;

  let parsed: { category?: string | null; reason?: string };
  try {
    const text = await callLLM({ prompt, maxTokens: 100, jsonMode: true });
    parsed = parseJSONResponse(text);
  } catch (e) {
    return { category: null, reason: (e as Error).message.slice(0, 80) };
  }

  const cat = parsed.category;
  if (!cat || !(allowed as readonly string[]).includes(cat)) {
    return { category: null, reason: parsed.reason || "invalid_category" };
  }
  return { category: cat, reason: parsed.reason || "" };
}
