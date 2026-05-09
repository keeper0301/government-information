// ============================================================
// A4 — 카테고리 누락 정책 LLM 자동 분류 (Claude Haiku).
// ============================================================
// welfare 카테고리: 생계 / 의료 / 양육 / 교육 / 취업 / 주거 / 문화 / 창업
// loan 카테고리:    정책자금 / 창업자금 / 소상공인 / 생계자금 / 주거자금 / 농어업 / 기타
// 정책 1건당 ~$0.003. cron 마다 50건 처리 = ~$0.15/일.

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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { category: null, reason: "ANTHROPIC_API_KEY missing" };

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
        max_tokens: 100,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    return { category: null, reason: `network: ${(e as Error).message.slice(0, 80)}` };
  }

  if (!res.ok) return { category: null, reason: `http_${res.status}` };

  const data = (await res.json().catch(() => null)) as
    | { content?: Array<{ type: string; text: string }> }
    | null;
  const text = data?.content?.find((c) => c.type === "text")?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { category: null, reason: "no_json" };

  try {
    const parsed = JSON.parse(match[0]) as {
      category?: string | null;
      reason?: string;
    };
    const cat = parsed.category;
    if (!cat || !(allowed as readonly string[]).includes(cat)) {
      return { category: null, reason: parsed.reason || "invalid_category" };
    }
    return { category: cat, reason: parsed.reason || "" };
  } catch {
    return { category: null, reason: "json_parse_failed" };
  }
}
