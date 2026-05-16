// ============================================================
// 블로그 품질 학습 힌트
// ============================================================
// blog-quality-check 가 admin_actions.details.improvements 에 남긴 지적을
// 다음 글 생성 프롬프트에 되먹임한다. 위험한 자동 수정 대신, 반복 실수를
// 생성 단계에서 줄이는 안전한 feedback loop.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_LIMIT = 5;
const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function extractQualityImprovementHints(
  rows: Array<{ details?: unknown }>,
  limit: number = DEFAULT_LIMIT,
): string[] {
  const hints: string[] = [];
  for (const row of rows) {
    if (!isRecord(row.details)) continue;
    const raw = row.details.improvements;
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      if (typeof item !== "string") continue;
      const text = item.trim();
      if (!text) continue;
      hints.push(text.slice(0, 120));
      if (hints.length >= limit) return [...new Set(hints)];
    }
  }
  return [...new Set(hints)].slice(0, limit);
}

export async function getRecentQualityImprovementHints({
  limit = DEFAULT_LIMIT,
  lookbackMs = DEFAULT_LOOKBACK_MS,
}: {
  limit?: number;
  lookbackMs?: number;
} = {}): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - lookbackMs).toISOString();
    const { data, error } = await admin
      .from("admin_actions")
      .select("details")
      .eq("action", "blog_quality_flag")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 2, 10));
    if (error || !data) return [];
    return extractQualityImprovementHints(
      data as Array<{ details?: unknown }>,
      limit,
    );
  } catch {
    return [];
  }
}
