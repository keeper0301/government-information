// ============================================================
// 광역 보도자료 → L2 confirm 후보 자동 분류 (cron)
// ============================================================
// 매일 KST 10:30 / 15:30 / 19:30 cron 3회 호출 (vercel.json UTC 기준).
// 후보 fetch → LLM 분류 → confirm 큐 저장.
//
// 안전 가드:
//   - 24h 후보 cap (BASE_CAP/BOOSTED_CAP, decideCap 동적 결정)
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

// 광역 보도자료 후보 cap — 적체 감지 시 동적 상향
// BASE_CAP × cron 3회/일 = 90건/일 capacity
// BOOSTED_CAP × 3회 = 150건/일 capacity (적체 spike 흡수)
// timeout margin: BOOSTED_CAP × 5초 = 250초 < maxDuration 300초
export const BASE_CAP = 30;
export const BOOSTED_CAP = 50;
const PROBE_LIMIT = 200; // cap 결정용 probe limit (실제 처리는 cap 만큼만)

/**
 * 후보 수에 따라 처리 cap 을 결정.
 * pure function — decideCap(N) 만 단위 테스트.
 */
export function decideCap(probedCount: number): number {
  return probedCount > BASE_CAP ? BOOSTED_CAP : BASE_CAP;
}

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

  // 1) 24h 후보 fetch — PROBE_LIMIT 까지 (cap 결정용)
  // 후보 수가 BASE_CAP 초과면 BOOSTED_CAP 으로 동적 상향
  const probed = await getPressIngestCandidates(24, PROBE_LIMIT);
  const cap = decideCap(probed.length);
  const candidates = probed.slice(0, cap);
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
