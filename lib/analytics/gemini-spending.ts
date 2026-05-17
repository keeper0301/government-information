// ============================================================
// LLM 월 지출 추적 (5/17 — Gemini → OpenAI 마이그 후)
// ============================================================
// admin_actions.blog_publish_run audit 의 details.results[].usage 에서
// token 누적 → 28일 ₩ 추정. autonomous hub 지출 카드 원본.
//
// 2026-05-17 G5: lib/ai.ts 가 Gemini → OpenAI gpt-4o-mini 로 마이그.
// 단가 갱신. cap 은 OpenAI API 한도 (사장님 console 별도 설정) 기준.
//
// 단가 (OpenAI gpt-4o-mini, 2026):
//   - Input: $0.15 / 1M tokens
//   - Output: $0.60 / 1M tokens
//   - 환율 1$ = ₩1,380 가정 (보수적)
//
// 파일명·심볼명 (gemini-spending / GEMINI_KEEPIOO_CAP_KRW) 은 호출 측 영향 최소화
// 위해 유지. 미래 cleanup 시 llm-spending 으로 rename 권장.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

const INPUT_PRICE_PER_M = 0.15; // USD — OpenAI gpt-4o-mini
const OUTPUT_PRICE_PER_M = 0.6; // USD — OpenAI gpt-4o-mini
const USD_TO_KRW = 1380; // 환율 가정 (보수적)

// keepioo 프로젝트 LLM 월 지출 cap. 사장님 console 인상 시 같이 갱신.
// autonomous hub 카드 + daily-digest 80% 알림 공통 사용.
// Gemini 시대 ₩30K 그대로 유지 — 단가 2배이지만 발행량 동일이라 약 ₩6K 수준 추정.
export const GEMINI_KEEPIOO_CAP_KRW = 30000;

export type GeminiSpendingStat = {
  windowDays: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostKrw: number;
  monthlyProjectionKrw: number; // 30일 환산 (window 기반)
};

type UsageRow = {
  details: {
    results?: Array<{
      ok?: boolean;
      usage?: {
        promptTokens: number;
        candidatesTokens: number;
        totalTokens: number;
      } | null;
    }>;
  } | null;
};

export async function getGeminiSpendingStats(
  windowDays: number = 28,
): Promise<GeminiSpendingStat> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - windowDays * 24 * 3600_000).toISOString();

  const { data } = await admin
    .from("admin_actions")
    .select("details")
    .eq("action", "blog_publish_run")
    .gte("created_at", since);

  let totalCalls = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const row of (data ?? []) as UsageRow[]) {
    const results = row.details?.results ?? [];
    for (const r of results) {
      if (!r.ok || !r.usage) continue;
      totalCalls += 1;
      totalInputTokens += r.usage.promptTokens;
      totalOutputTokens += r.usage.candidatesTokens;
    }
  }

  const inputCostUsd = (totalInputTokens / 1_000_000) * INPUT_PRICE_PER_M;
  const outputCostUsd = (totalOutputTokens / 1_000_000) * OUTPUT_PRICE_PER_M;
  const totalCostKrw = (inputCostUsd + outputCostUsd) * USD_TO_KRW;
  const monthlyProjectionKrw = (totalCostKrw / windowDays) * 30;

  return {
    windowDays,
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
    totalCostKrw,
    monthlyProjectionKrw,
  };
}
