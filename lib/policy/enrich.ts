// ============================================================
// 다 묶음 — 정책 본문 자동 풍부화 (키워드 + 한 줄 요약).
// ============================================================
// LLM 1회 호출에 두 정보 동시 추출 — 비용 절약.
// ~$0.003/건. 매일 30건 = ~$0.1/일.

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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return EMPTY;

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
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch {
    return EMPTY;
  }
  if (!res.ok) return EMPTY;

  const data = (await res.json().catch(() => null)) as
    | { content?: Array<{ type: string; text: string }> }
    | null;
  const responseText = data?.content?.find((c) => c.type === "text")?.text ?? "";
  const match = responseText.match(/\{[\s\S]*\}/);
  if (!match) return EMPTY;

  try {
    const parsed = JSON.parse(match[0]) as {
      keywords?: unknown;
      summary_short?: unknown;
    };
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
  } catch {
    return EMPTY;
  }
}
