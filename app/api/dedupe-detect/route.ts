// ============================================================
// /api/dedupe-detect — welfare/loan 중복 정책 자동 탐지 cron
// ============================================================
// 매일 02:00 KST (UTC 17:00 전일) 실행. 신규 row (최근 7일 created_at) 를
// 기존 활성 row (apply_end >= today OR null) 와 페어 매칭해 score ≥ 0.7 페어를
// duplicate_of_id 에 임시 저장. 사장님이 /admin/dedupe 에서 confirm/reject.
//
// 자동 confirm 안 함 — false positive 시 유저에게 보이는 row 가 사라지는 위험.
// 사장님이 매일 1회 검수하면 충분. (4 signal 매칭 + 임계 0.7 → 정밀도 우선)
//
// 같은 source_code 끼리는 collector upsert 가 처리하므로 cross-source 중복만 잡음.
// 인증: CRON_SECRET Bearer (다른 cron 과 동일 패턴).
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCronFailure } from "@/lib/email";
import { logAdminAction } from "@/lib/admin-actions";
import {
  detectDuplicateScore,
  getDedupeSelectColumns,
  normalizeDedupeDbRow,
  type DedupeDbRow,
  type DedupeRow,
  type DedupeTableName,
} from "@/lib/dedupe/welfare-loan";

// score ≥ 임계 (거의 동일 정책) 자동 confirm — 사장님 검수 큐에서 자동 빠짐.
// 환경변수 DEDUPE_AUTO_CONFIRM_THRESHOLD 로 1분 안에 toggle 가능 (spec A A1).
// default 0.95 — 점진 도입 (W1 0.92 → W2 0.88 → W3 0.86 → W4 0.85) 시 env 만 변경.
// 0.95 미만은 false positive 위험으로 사장님 검수 큐 (기존 동작).
const AUTO_CONFIRM_SCORE_THRESHOLD = (() => {
  const raw = process.env.DEDUPE_AUTO_CONFIRM_THRESHOLD;
  if (!raw) return 0.95;
  const parsed = parseFloat(raw);
  // 잘못된 env 값 (NaN·범위 외) → safe default 0.95 + 로그
  if (Number.isNaN(parsed) || parsed < 0.5 || parsed > 1.0) {
    console.warn(
      `[dedupe-detect] DEDUPE_AUTO_CONFIRM_THRESHOLD invalid (${raw}), fallback 0.95`,
    );
    return 0.95;
  }
  return parsed;
})();

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 신규 row 윈도우 — 최근 7일 (cron 매일 돌므로 사실상 24h 면 충분하지만
// 일시 cron 누락 시 catch-up 차원에서 7일 안전 마진).
const NEW_ROW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type TableName = DedupeTableName;

interface DetectResult {
  table: TableName;
  newCount: number;       // 신규 윈도우 안 row 수
  activeCount: number;    // 활성 row 수 (비교 대상)
  matched: number;        // duplicate_of_id 신규 저장 수
  /** score ≥ 0.95 자동 confirm 된 페어 수 — 사장님 검수 큐에서 자동 빠짐 */
  autoConfirmed: number;
  // score 분포 — 사장님이 첫 1주일 reject 비율 보고 임계값 조정 판단용
  scoreBuckets: { range_0_7_to_0_8: number; range_0_8_to_0_9: number; range_0_9_plus: number };
}

// ─── 한 테이블 dedupe 수행 ───────────────────────────────
async function detectInTable(
  admin: ReturnType<typeof createAdminClient>,
  table: TableName,
): Promise<DetectResult> {
  const today = new Date().toISOString().split("T")[0];
  const sinceIso = new Date(Date.now() - NEW_ROW_WINDOW_MS).toISOString();

  // 신규 row — duplicate_of_id 가 아직 비어있고 (이미 매칭된 건 skip)
  // 최근 7일 안에 들어온 것만.
  const { data: newRows, error: newErr } = await admin
    .from(table)
    .select(getDedupeSelectColumns(table))
    .is("duplicate_of_id", null)
    .gte("created_at", sinceIso);

  if (newErr) {
    throw new Error(`${table} 신규 조회 실패: ${newErr.message}`);
  }

  // 활성 row — 마감일이 미래거나 null. 신규/활성 모두 한 큰 set 안에 있을 수
  // 있어 detectDuplicateScore 가 같은 id 를 자기참조로 거름.
  const { data: activeRows, error: actErr } = await admin
    .from(table)
    .select(getDedupeSelectColumns(table))
    .or(`apply_end.gte.${today},apply_end.is.null`);

  if (actErr) {
    throw new Error(`${table} 활성 조회 실패: ${actErr.message}`);
  }

  const news: DedupeRow[] = ((newRows ?? []) as unknown as DedupeDbRow[]).map((row) =>
    normalizeDedupeDbRow(table, row),
  );
  const actives: DedupeRow[] = ((activeRows ?? []) as unknown as DedupeDbRow[]).map((row) =>
    normalizeDedupeDbRow(table, row),
  );

  const emptyBuckets = { range_0_7_to_0_8: 0, range_0_8_to_0_9: 0, range_0_9_plus: 0 };
  if (news.length === 0 || actives.length === 0) {
    return {
      table,
      newCount: news.length,
      activeCount: actives.length,
      matched: 0,
      autoConfirmed: 0,
      scoreBuckets: emptyBuckets,
    };
  }

  // 1차 — 매칭 페어 수집 (DB write 없음, 순수 inner loop). O(N×M).
  // 신규 7일 × 활성 (수천) — 정규화 결과 row 별로 microsec.
  // matched 페어를 일괄 모은 뒤 batch update 로 처리해 직렬 await 의 60s 한도 부담 회피.
  const matches: Array<{ newId: string; bestId: string; score: number }> = [];
  const buckets = { ...emptyBuckets };
  for (const newRow of news) {
    let best: { id: string; score: number } | null = null;
    for (const act of actives) {
      const m = detectDuplicateScore(newRow, act);
      if (m && (!best || m.score > best.score)) {
        best = { id: act.id, score: m.score };
      }
    }
    if (best) {
      matches.push({ newId: newRow.id, bestId: best.id, score: best.score });
      // score 분포 집계 (운영 모니터링)
      if (best.score >= 0.9) buckets.range_0_9_plus++;
      else if (best.score >= 0.8) buckets.range_0_8_to_0_9++;
      else buckets.range_0_7_to_0_8++;
    }
  }

  // 2차 — Promise batch (10건씩) update. 직렬 await 대비 약 10배 throughput.
  // score ≥ 0.95 (거의 동일) 페어는 dedupe_auto_confirmed_at 동시 채워서 사장님 검수 큐에서 자동 제외.
  const BATCH_SIZE = 10;
  let matched = 0;
  let autoConfirmed = 0;
  const now = new Date().toISOString();
  const autoConfirmedPairs: Array<{ newId: string; bestId: string; score: number }> = [];

  for (let i = 0; i < matches.length; i += BATCH_SIZE) {
    const batch = matches.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(({ newId, bestId, score }) => {
        const updatePayload: Record<string, unknown> = { duplicate_of_id: bestId };
        if (score >= AUTO_CONFIRM_SCORE_THRESHOLD) {
          updatePayload.dedupe_auto_confirmed_at = now;
        }
        return admin.from(table).update(updatePayload).eq("id", newId);
      }),
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.error) {
        // 단건 실패는 cron 전체를 막지 않음 — 다음 라운드 재시도 가능
        console.warn(
          `[dedupe-detect] ${table} ${batch[j].newId} update 실패:`,
          r.error.message,
        );
      } else {
        matched++;
        if (batch[j].score >= AUTO_CONFIRM_SCORE_THRESHOLD) {
          autoConfirmed++;
          autoConfirmedPairs.push(batch[j]);
        }
      }
    }
  }

  // 자동 confirm 된 페어를 admin_actions 에 일괄 audit 기록 (사장님 추적용).
  // 감사 로그 실패는 dedupe 자체 영향 없게 try/catch 격리.
  for (const pair of autoConfirmedPairs) {
    try {
      await logAdminAction({
        actorId: null, // system
        action: "dedupe_auto_confirm",
        details: {
          table,
          duplicate_id: pair.newId,
          original_id: pair.bestId,
          score: pair.score,
        },
      });
    } catch {
      // 감사 로그 실패는 무시
    }
  }

  return {
    table,
    newCount: news.length,
    activeCount: actives.length,
    matched,
    autoConfirmed,
    scoreBuckets: buckets,
  };
}

// ─── 본 작업 ─────────────────────────────────────────────
async function runDedupe() {
  const admin = createAdminClient();
  const [welfare, loan] = await Promise.all([
    detectInTable(admin, "welfare_programs"),
    detectInTable(admin, "loan_programs"),
  ]);
  return { welfare, loan };
}

// ─── 인증 가드 ───────────────────────────────────────────
function checkAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

async function runAndRespond(jobLabel: string) {
  try {
    const result = await runDedupe();
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    await notifyCronFailure(jobLabel, message);
    return NextResponse.json(
      { error: "dedupe 실패", detail: message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const fail = checkAuth(request);
  if (fail) return fail;
  return runAndRespond("dedupe-detect (POST)");
}

export async function GET(request: NextRequest) {
  const fail = checkAuth(request);
  if (fail) return fail;
  return runAndRespond("dedupe-detect (cron)");
}
