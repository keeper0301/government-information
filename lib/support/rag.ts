// ============================================================
// Phase 4-B RAG — policy_question intent 자동 답변 (welfare/loan 검색 + LLM 요약).
// ============================================================
// 1. 사용자 질문에서 keyword 추출 (불용어 제거)
// 2. welfare/loan 의 title·description ILIKE OR 검색 (단순 패턴, 추후 FTS·embeddings 가능)
// 3. Claude Haiku 가 top 30 개 중 가장 관련 있는 1~3 개 선택 + 한국어 답변 생성
// 4. 답변 신뢰도 낮으면 (정책 미발견·LLM 미응답) "사장님 답변 대기" fallback

import { createAdminClient } from "@/lib/supabase/admin";

// 한국어 불용어 — 의문문 패턴 위주. 너무 많으면 성능 저하.
const STOPWORDS = new Set([
  "저는", "제가", "어떻게", "어떤", "무엇", "있나요", "있어요", "있습니까",
  "알려", "주세요", "주시", "해주세요", "해주실", "이거", "그것", "이게",
  "그게", "있을까요", "되나요", "되는", "받을", "받고", "싶어요", "싶습니다",
  "얼마", "언제", "어디서", "어디", "정도",
]);

export interface PolicyMatch {
  table: "welfare_programs" | "loan_programs";
  id: string;
  title: string;
  description: string | null;
  apply_url: string | null;
}

// 한국어 keyword 추출 — 공백·구두점 분리 + 2자 이상 + 불용어 제외.
// pure function — 단위 테스트 용이.
export function extractKeywords(question: string, max = 3): string[] {
  return question
    .split(/[\s,.\?!()\[\]<>•·:;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !STOPWORDS.has(s))
    .slice(0, max);
}

export async function searchPolicies(
  question: string,
): Promise<PolicyMatch[]> {
  const keywords = extractKeywords(question);
  if (keywords.length === 0) return [];

  const admin = createAdminClient();
  // PostgREST or() — 각 keyword 마다 title/description ILIKE.
  // SQL injection 방지 위해 keyword 안 % 와 , 이스케이프.
  const safe = keywords.map((k) => k.replace(/[%,()]/g, ""));
  const orFilter = safe
    .map((k) => `title.ilike.%${k}%,description.ilike.%${k}%`)
    .join(",");

  const [welfare, loan] = await Promise.all([
    admin
      .from("welfare_programs")
      .select("id, title, description, apply_url")
      .or(orFilter)
      .limit(15),
    admin
      .from("loan_programs")
      .select("id, title, description, apply_url")
      .or(orFilter)
      .limit(15),
  ]);

  const results: PolicyMatch[] = [];
  for (const r of (welfare.data ?? []) as Array<{
    id: string;
    title: string;
    description: string | null;
    apply_url: string | null;
  }>) {
    results.push({
      table: "welfare_programs",
      id: r.id,
      title: r.title,
      description: r.description,
      apply_url: r.apply_url,
    });
  }
  for (const r of (loan.data ?? []) as Array<{
    id: string;
    title: string;
    description: string | null;
    apply_url: string | null;
  }>) {
    results.push({
      table: "loan_programs",
      id: r.id,
      title: r.title,
      description: r.description,
      apply_url: r.apply_url,
    });
  }
  return results;
}

// LLM 답변 생성 — 정책 미발견 시 fallback 응답 반환.
export async function generatePolicyAnswer(
  question: string,
  matches: PolicyMatch[],
): Promise<{ answer: string; cited: PolicyMatch[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const FALLBACK =
    "검색하신 정책에 정확히 매칭되는 데이터를 찾지 못했어요. 사장님이 직접 검토 후 24시간 이내 답변드릴게요.";

  if (!apiKey || matches.length === 0) {
    return { answer: FALLBACK, cited: [] };
  }

  const programs = matches.slice(0, 30);
  const programsText = programs
    .map((p, i) => {
      const desc = (p.description ?? "").slice(0, 200);
      const url = p.apply_url ?? "URL 없음";
      return `[${i + 1}] ${p.title} | ${desc} | ${url}`;
    })
    .join("\n");

  const prompt = `당신은 keepioo (정부 정책 안내) 의 CS 응대 도우미입니다.
사용자 질문에 답하기 위해 아래 정책 데이터 중 가장 관련 있는 것 1~3개를 선택해 친절한 한국어 답변을 작성하세요.

규칙:
- 정확히 매칭되는 정책이 없으면 "정확한 정책을 찾지 못했어요. 사장님 답변을 기다려 주세요." 라고만 답변
- 매칭되면 정책 이름·핵심 내용·신청 URL 명시
- 답변 길이 200자 이내, 한국어 존댓말
- 추측 금지 — 데이터에 없는 정보는 만들지 말 것

질문: ${question}

정책 데이터:
${programsText}

답변:`;

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
    return { answer: FALLBACK, cited: [] };
  }

  if (!res.ok) return { answer: FALLBACK, cited: [] };

  const data = (await res.json().catch(() => null)) as
    | { content?: Array<{ type: string; text: string }> }
    | null;
  const text = data?.content?.find((c) => c.type === "text")?.text?.trim();
  if (!text) return { answer: FALLBACK, cited: [] };

  return { answer: text, cited: programs.slice(0, 3) };
}
