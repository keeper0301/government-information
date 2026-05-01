// ============================================================
// 광역 보도자료 → L2 confirm 후보 자동 분류 (cron)
// ============================================================
// 매일 09:00 KST cron 이 호출. 후보 fetch → LLM 분류 → confirm 큐 저장.
//
// 안전 가드:
//   - 24h 후보 cap (CANDIDATE_LIMIT)
//   - news_id UNIQUE 후보 큐로 반복 LLM 비용 방지
//   - is_policy=false / unsure / classify error 도 큐에 기록해 재분류 루프 차단
//   - confirm 전 welfare/loan INSERT 없음
//   - admin_actions L2 분류 기록
//
// 비용: 후보 30건/일 × $0.003 = $0.09/일 = ~$3/월
// ============================================================

import { logAdminAction } from "@/lib/admin-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPressIngestCandidates } from "./filter";
import { classifyPressNews } from "./classify";
import {
  buildCandidateUpsert,
  buildFailedCandidateUpsert,
  getExistingPressCandidate,
  upsertPressCandidate,
} from "./candidates";

const CANDIDATE_LIMIT = 30; // 24h 후보 cap (LLM 비용 통제)

export type IngestResult = {
  candidates: number; // 후보 N건
  classified: number; // LLM 분류 성공 K건
  queued_pending: number;
  queued_skipped: number;
  queued_failed: number;
  skipped_existing: number;
  skipped_classify_error: number;
  errors: string[];
};

// 메인 — cron 이 호출
export async function runAutoIngest(): Promise<IngestResult> {
  const result: IngestResult = {
    candidates: 0,
    classified: 0,
    queued_pending: 0,
    queued_skipped: 0,
    queued_failed: 0,
    skipped_existing: 0,
    skipped_classify_error: 0,
    errors: [],
  };

  // 1) 24h 후보 fetch (cap)
  const candidates = await getPressIngestCandidates(24, CANDIDATE_LIMIT);
  result.candidates = candidates.length;

  // 2) 각 후보별 LLM 분류 + 후보 큐 저장 (순차 — Anthropic rate limit 보호)
  for (const c of candidates) {
    const existing = await getExistingPressCandidate(c.id);
    if (existing) {
      result.skipped_existing += 1;
      continue;
    }

    // LLM 분류
    try {
      // body 도 fetch (filter 함수는 summary 만 가져왔음)
      const admin = createAdminClient();
      const { data: full } = await admin
        .from("news_posts")
        .select("body")
        .eq("id", c.id)
        .maybeSingle();
      const classified = await classifyPressNews({
        title: c.title,
        summary: c.summary,
        body: (full as { body: string | null } | null)?.body ?? null,
      });
      result.classified += 1;

      const upsert = buildCandidateUpsert({ newsId: c.id, result: classified });
      await upsertPressCandidate(upsert);
      if (upsert.status === "pending") result.queued_pending += 1;
      else result.queued_skipped += 1;

      try {
        await logAdminAction({
          actorId: null,
          action: "press_l2_classify",
          details: {
            news_id: c.id,
            ministry: c.ministry,
            title: classified.title,
            status: upsert.status,
            program_type: upsert.program_type,
            category: classified.category,
          },
        });
      } catch (auditErr) {
        result.errors.push(`[${c.id}] audit: ${(auditErr as Error).message}`);
      }
    } catch (e) {
      const message = (e as Error).message;
      result.skipped_classify_error += 1;
      result.errors.push(`[${c.id}] classify: ${message}`);
      try {
        await upsertPressCandidate(
          buildFailedCandidateUpsert({
            newsId: c.id,
            title: c.title,
            error: message,
          }),
        );
        result.queued_failed += 1;
      } catch (saveErr) {
        result.errors.push(`[${c.id}] failed-save: ${(saveErr as Error).message}`);
      }
    }
  }

  return result;
}
