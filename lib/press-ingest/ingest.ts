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
  autoConfirmPendingPressCandidates,
  buildCandidateUpsert,
  buildFailedCandidateUpsert,
  getExistingPressCandidate,
  newsSourceUrl,
  upsertPressCandidate,
  type AutoConfirmLayerBreakdown,
} from "./candidates";
// 4 layer apply_url fallback — apply_url null 사례 자동 채움 (자동 confirm 률 ↑)
import { resolveApplyUrl } from "./url-fallback";

// 광역 보도자료 후보 cap — 적체 감지 시 동적 상향
// BASE_CAP × cron 3회/일 = 90건/일 capacity
// BOOSTED_CAP × 3회 = 150건/일 capacity (적체 spike 흡수)
// timeout margin: BOOSTED_CAP × 5초 = 250초 < maxDuration 300초
export const BASE_CAP = 30;
export const BOOSTED_CAP = 50;
const PROBE_LIMIT = 200; // cap 결정용 probe limit (실제 처리는 cap 만큼만)

// 자동 승인 cap — cron 당 최대 자동 confirm 건수
// 적체 큐가 있어도 한 번에 폭주하지 않도록 점진 해소.
// 50 × cron 3회/일 = 150건/일 자동 승인 가능 → 적체 100~150건도 1일 안에 해소.
export const AUTO_CONFIRM_CAP = 50;

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
  /** 자동 승인 — apply_url 있어 즉시 welfare/loan 등록된 후보 수 */
  auto_confirmed: number;
  /** 자동 승인 중 4 layer fallback 으로 url 채운 후보 수 (분포 확인용) */
  auto_fallback_filled: number;
  /** Layer 별 회수 분포 — 운영 가시성 (사장님 광역 매핑 의존도 확인) */
  auto_layer_breakdown: AutoConfirmLayerBreakdown;
  /** 자동 승인 보류 — fallback 후에도 url 0 인 사례 (이론상 거의 0) */
  auto_skipped_no_url: number;
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
    auto_confirmed: 0,
    auto_fallback_filled: 0,
    auto_layer_breakdown: {
      llm: 0,
      body_urls: 0,
      body_regex: 0,
      province: 0,
      source_url: 0,
    },
    auto_skipped_no_url: 0,
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
      const bodyText = (full as { body: string | null } | null)?.body ?? null;
      const classified = await classifyPressNews({
        title: c.title,
        summary: c.summary,
        body: bodyText,
      });
      result.classified += 1;

      // 4 layer apply_url fallback — LLM apply_url 이 null/missing 이어도 본문/광역 매핑/source_url
      // 으로 자동 채움. 정부 도메인 화이트리스트로 광고·외부 사이트 차단.
      // is_policy=true 일 때만 fallback (아니면 INSERT 안 들어가니 무의미)
      if (classified.is_policy) {
        const fallback = resolveApplyUrl({
          llmApplyUrl: classified.apply_url,
          bodyUrls: classified.body_urls ?? [],
          body: bodyText,
          ministry: c.ministry,
          sourceUrl: newsSourceUrl({ id: c.id, slug: c.slug }),
        });
        classified.apply_url = fallback.url;
      }

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

  // 3) 자동 승인 — pending + apply_url 있는 후보를 cap 만큼 일괄 등록.
  // 적체 큐도 cron 마다 점진적으로 해소. apply_url 없는 후보는 사장님 수동 검토 대상으로 pending 유지.
  // confirm 도중 일부 실패해도 ingest 전체는 실패 처리하지 않음 (errors 에 누적).
  try {
    const auto = await autoConfirmPendingPressCandidates({ limit: AUTO_CONFIRM_CAP });
    result.auto_confirmed = auto.confirmed;
    result.auto_fallback_filled = auto.fallback_filled;
    result.auto_layer_breakdown = auto.layer_breakdown;
    result.auto_skipped_no_url = auto.skipped_no_url;
    if (auto.errors.length > 0) {
      result.errors.push(
        ...auto.errors.map((e) => `[${e.candidate_id}] auto-confirm: ${e.message}`),
      );
    }
  } catch (e) {
    result.errors.push(`auto-confirm: ${(e as Error).message}`);
  }

  return result;
}
