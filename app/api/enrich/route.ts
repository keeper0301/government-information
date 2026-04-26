// ============================================================
// /api/enrich — 상세 API 2단계 fetch (cron)
// ============================================================
// 목록 API 가 못 채우는 빈 필드 (eligibility·selection_criteria·
// contact_info·detailed_content 등) 를 각 source 의 공식 Detail API 로 채움.
// LLM 미사용 (enrich-llm 은 2026-04-24 폐기).
//
// 처리 흐름:
//   1) welfare_programs / loan_programs 에서 후보 조회
//      - last_detail_fetched_at NULL OR < 7일전  (성공 cooldown)
//      - AND last_detail_failed_at NULL OR < 1일전  (실패 cooldown)
//   2) DETAIL_FETCHERS 중 applies() 맞는 fetcher 로 fetch
//   3) 성공: 필드 UPDATE + last_detail_fetched_at=now
//      실패: last_detail_failed_at=now
//   4) 실패율 50%+ 면 운영자 알림 (외부 API 장애 감지)
//
// Vercel Hobby 60초 한도 + data.go.kr 분당 15회 rate limit 동시 고려.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCronFailure } from "@/lib/email";
import {
  findFetcher,
  FETCHABLE_WELFARE_SOURCES,
  FETCHABLE_LOAN_SOURCES,
  type RowIdentity,
  type DetailResult,
} from "@/lib/detail-fetchers";
import { QuotaExceededError } from "@/lib/detail-fetchers/bokjiro";

// 10건 × 4초 interval = 36초 + fetch 응답 (~1~2s × 10) = ~50s → 60s 한도에 여유.
// 최초엔 12 로 설정했으나 코드리뷰 결과 fetch 지연 누적 시 60s 초과 가능성
// 발견 → 10 으로 하향 (BATCH_SIZE 의 실측 상한).
const BATCH_SIZE = 10;
const CALL_INTERVAL_MS = 4000;
const COOLDOWN_OK_MS = 7 * 24 * 60 * 60 * 1000;  // 성공: 7일
// 실패 cooldown 1d → 7d 로 확장 (2026-04-27 사고 hot-fix).
// 외부 API (bokjiro Detail) 가 invalid servId 에 일관 실패 응답 보내면
// 1d cooldown 으론 매일 같은 row 재시도 → 무한 루프 + 알림 잠재 폭주.
// 7d 면 외부 회복 후에도 1주 안에 재시도. 사용자 영향 미미 (이미 7일 안에
// 한 번은 시도하니 채움률 거의 동일).
const COOLDOWN_FAIL_MS = 7 * 24 * 60 * 60 * 1000;
// 영구 skip 임계값 (마이그레이션 058 — 진짜 근본 fix).
// 연속 N 회 실패 도달 시 detail_permanently_skipped_at 도장 → picker 가 영구 제외.
// 외부 API 회복 시 /admin/enrich-detail [영구 skip 해제] 로 일괄 reset.
//   3 회: bokjiro 220건 1주일 내 자연 도장 완료 → 매주 1,720회 외부 호출 절감
//   2 회로 너무 공격적이면 일시 장애 row 도 영구 skip → 데이터 누락 위험
//   3 회면 외부 일시 장애(1d cooldown × 3 = 21일) 후에도 1번은 더 시도 → 안전
const PERMANENT_SKIP_THRESHOLD = 3;

type TableName = "welfare_programs" | "loan_programs";

type Candidate = RowIdentity & {
  table: TableName;
  serv_id: string | null; // welfare 만 가진 legacy 컬럼 (bokjiro servId)
  detail_failed_count: number; // 058: 영구 skip 카운터 (성공 시 0 reset)
};

// welfare + loan 테이블에서 후보 row 조회.
// source_id 는 신규, serv_id 는 과거 bokjiro collector 가 쓰던 컬럼 — 둘 중 하나만 있는 row 도 존재.
async function pickCandidates(
  supabase: ReturnType<typeof createAdminClient>,
  limit: number,
): Promise<Candidate[]> {
  const okThreshold = new Date(Date.now() - COOLDOWN_OK_MS).toISOString();
  const failThreshold = new Date(Date.now() - COOLDOWN_FAIL_MS).toISOString();

  // welfare / loan 각각 별도 쿼리 — select 문자열을 동적으로 만들면 supabase-js 타입 추론이 깨짐.
  //
  // 2026-04-26 source_code 화이트리스트 (FETCHABLE_*_SOURCES) — fetcher 매칭
  // 가능한 source 만 후보 큐에 진입. 이전엔 fetcher 없는 local-welfare 8580건
  // 등 노이즈가 매 batch 후보를 점유해 bokjiro/mss 진행률 1~2%/일 수준.
  // 화이트리스트로 noise 제거 후 진행률 5~10배 향상 예상.
  //
  // 2026-04-25 limit 분배 균등화 — 이전엔 welfare 와 loan 각각 limit 만큼 뽑은 뒤
  // [...w, ...l].slice(0, limit) 로 잘라서 결과적으로 welfare 가 항상 우선 처리됨.
  // 그 결과 loan_programs 의 mss row (raw_payload 채워져 fetcher 통과 가능) 가
  // welfare 후보가 소진될 때까지 영원히 enrich 안 되는 편향 발생 → 절반씩 분배.
  const halfLimit = Math.ceil(limit / 2);
  // 058: detail_permanently_skipped_at IS NULL 필터 — 영구 skip 도장 row 는 picker 단계에서 즉시 제외.
  // detail_failed_count 도 select — enrichOne 실패 시 +1 후 임계값 체크에 사용.
  const [w, l] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("id, source_code, source_id, source_url, serv_id, raw_payload, detail_failed_count")
      .in("source_code", [...FETCHABLE_WELFARE_SOURCES])
      .is("detail_permanently_skipped_at", null)
      .or(`last_detail_fetched_at.is.null,last_detail_fetched_at.lt.${okThreshold}`)
      .or(`last_detail_failed_at.is.null,last_detail_failed_at.lt.${failThreshold}`)
      .order("last_detail_fetched_at", { ascending: true, nullsFirst: true })
      .limit(halfLimit),
    supabase
      .from("loan_programs")
      .select("id, source_code, source_id, source_url, raw_payload, detail_failed_count")
      .in("source_code", [...FETCHABLE_LOAN_SOURCES])
      .is("detail_permanently_skipped_at", null)
      .or(`last_detail_fetched_at.is.null,last_detail_fetched_at.lt.${okThreshold}`)
      .or(`last_detail_failed_at.is.null,last_detail_failed_at.lt.${failThreshold}`)
      .order("last_detail_fetched_at", { ascending: true, nullsFirst: true })
      .limit(halfLimit),
  ]);

  // Picker 후처리 — fetcher 매칭 불가능한 row (source_id·raw_payload 둘 다 null)
  // 를 picker 단계에서 제외. SQL .or() 안에 not.is.null 호환성 위험 회피 차원으로
  // JS filter 채택. invalid row 가 batch 점유해 "모든 후보 skipped" 알림 폭주
  // 차단 + 진짜 처리 가능한 row 가 batch 자리 차지.
  // welfare: source_id (bokjiro) 또는 raw_payload (youth-v2) 둘 중 하나는 필요
  // loan(mss): source_id 필수
  const wRows = (w.data ?? []).filter(
    (r) => (r.source_id ?? r.serv_id) != null || r.raw_payload != null,
  );
  const lRows = (l.data ?? []).filter((r) => r.source_id != null);

  const out: Candidate[] = [];
  for (const r of wRows) {
    out.push({
      id: r.id,
      source_code: r.source_code,
      source_id: r.source_id ?? r.serv_id ?? null,
      source_url: r.source_url,
      raw_payload: (r.raw_payload as Record<string, unknown> | null) ?? null,
      serv_id: r.serv_id,
      detail_failed_count: r.detail_failed_count ?? 0,
      table: "welfare_programs",
    });
  }
  for (const r of lRows) {
    out.push({
      id: r.id,
      source_code: r.source_code,
      source_id: r.source_id,
      source_url: r.source_url,
      raw_payload: (r.raw_payload as Record<string, unknown> | null) ?? null,
      serv_id: null,
      detail_failed_count: r.detail_failed_count ?? 0,
      table: "loan_programs",
    });
  }
  // source_code 없는 row 는 fetcher 매칭 불가 → 여기서 제외하지 않고 아래에서 skip.
  return out.slice(0, limit);
}

// 실제 fetch 1건. 성공/실패 여부와 함께 매칭된 fetcher 없는 경우는 skipped.
async function enrichOne(
  supabase: ReturnType<typeof createAdminClient>,
  row: Candidate,
): Promise<"ok" | "failed" | "skipped"> {
  const fetcher = findFetcher(row);
  if (!fetcher) {
    // 처리 가능한 fetcher 없음. last_detail_fetched_at 을 찍어 재시도 루프 탈출.
    // (failed 는 1일 쿨다운이라 계속 후보로 돌아옴 → 낭비)
    await supabase
      .from(row.table)
      .update({ last_detail_fetched_at: new Date().toISOString() })
      .eq("id", row.id);
    return "skipped";
  }

  try {
    const result = await fetcher.fetchDetail(row);
    if (!result) {
      // 응답은 왔지만 데이터 없음 — skipped 와 동일 처리
      await supabase
        .from(row.table)
        .update({ last_detail_fetched_at: new Date().toISOString() })
        .eq("id", row.id);
      return "skipped";
    }

    // 채워진 필드만 UPDATE (기존 값이 있어도 Detail API 최신성이 더 높으므로 덮어씀)
    // 058: 성공 시 detail_failed_count 0 으로 reset — 일시 장애 후 회복한 row 가
    // 다음 한두 번 실패에 영구 skip 으로 떨어지지 않게 카운터 깨끗이.
    const update: Record<string, string | number | null> = {
      last_detail_fetched_at: new Date().toISOString(),
      detail_failed_count: 0,
    };
    const assign = (key: keyof DetailResult, maxLen: number) => {
      const v = result[key];
      if (v) update[key] = v.substring(0, maxLen);
    };
    assign("eligibility", 3000);
    assign("benefits", 3000);
    assign("selection_criteria", 3000);
    assign("apply_method", 2000);
    assign("required_documents", 2000);
    assign("contact_info", 2000);
    assign("detailed_content", 6000);

    const { error } = await supabase.from(row.table).update(update).eq("id", row.id);
    if (error) throw new Error(`DB update 실패: ${error.message}`);
    return "ok";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[enrich-detail] ${row.table} ${row.id} (${row.source_code}):`, msg);
    // QuotaExceededError 는 외부 quota 사정 (자정 KST 회복) 이므로 row 책임 아님.
    // 도장 찍지 않고 throw 만 → 다음 cron 에서 즉시 재시도. 도장 찍으면 1일
    // cooldown 들어가 회복 후에도 재시도 늦어지고, 매일 quota 사고 시 같은 row 가
    // 영구 누적되어 done 늘지 않는 사이클 발생 (2026-04-26 ~04-27 320건 누적 사고).
    if (err instanceof QuotaExceededError) throw err;
    // 일반 실패: 1일 cooldown 도장 + 058 영구 skip 카운터 +1.
    // 임계값 도달 시 detail_permanently_skipped_at 동시 도장 → picker 가 다음 cron 부터 즉시 제외.
    // detail_failed_count 는 candidate select 시점 값이라 동시성 위험 미미 (cron 1 batch 단위).
    const newCount = (row.detail_failed_count ?? 0) + 1;
    const failUpdate: Record<string, string | number | null> = {
      last_detail_failed_at: new Date().toISOString(),
      detail_failed_count: newCount,
    };
    if (newCount >= PERMANENT_SKIP_THRESHOLD) {
      failUpdate.detail_permanently_skipped_at = new Date().toISOString();
    }
    await supabase
      .from(row.table)
      .update(failUpdate)
      .eq("id", row.id);
    return "failed";
  }
}

async function enrichBatch(supabase: ReturnType<typeof createAdminClient>) {
  const candidates = await pickCandidates(supabase, BATCH_SIZE);
  if (candidates.length === 0) {
    return { ok: 0, failed: 0, skipped: 0, total: 0, quotaExceeded: false };
  }

  let ok = 0, failed = 0, skipped = 0;
  let quotaExceeded = false;
  for (let i = 0; i < candidates.length; i++) {
    try {
      const r = await enrichOne(supabase, candidates[i]);
      if (r === "ok") ok++;
      else if (r === "failed") failed++;
      else skipped++;
    } catch (err) {
      // QuotaExceededError → batch 즉시 중단. 남은 candidate 는 다음 cron 라운드에 처리.
      // enrichOne 이 quota 시 row 에 도장 안 찍으므로 failed 카운트도 증가시키지 않음.
      // (도장 수와 카운트가 정합 — /admin/enrich-detail 표시 misalign 방지)
      if (err instanceof QuotaExceededError) {
        quotaExceeded = true;
        break;
      }
      throw err;
    }
    // 마지막 건이 아니면 rate limit 준수
    if (i < candidates.length - 1) {
      await new Promise((res) => setTimeout(res, CALL_INTERVAL_MS));
    }
  }
  return { ok, failed, skipped, total: candidates.length, quotaExceeded };
}

async function runEnrichAndRespond(jobLabel: string) {
  try {
    const supabase = createAdminClient();
    const result = await enrichBatch(supabase);

    // quota 초과면 별도 단일 알림 — 24h dedupe 로 inbox 1건만 (자정 KST 자동 회복).
    // 실패율 알림(아래)과 분리해서 quota 별도 signature 로 cron_failure_log 디바운스.
    if (result.quotaExceeded) {
      await notifyCronFailure(
        `${jobLabel} - data.go.kr quota 초과`,
        `bokjiro Detail API 일일 quota 소진 (HTTP 403). 자정 KST 자동 회복 예상. 그동안 batch 즉시 중단.`,
      );
    }
    // 처리 가능한 후보 중 50% 이상 fetch 실패 시 알림 (quota 가 아닌 일반 실패만)
    else {
      const attempted = result.ok + result.failed;
      if (attempted > 0 && result.failed / attempted >= 0.5) {
        await notifyCronFailure(
          `${jobLabel} - Detail API 실패율 ${result.failed}/${attempted}`,
          `data.go.kr NationalWelfaredetailedV001 응답 이상. quota·서비스 장애 가능성.`,
        );
      }
    }
    // 전부 skipped 인 경우 — fetcher 누락 or applies 로직 깨짐. 운영 사각지대.
    if (result.total > 0 && result.ok === 0 && result.failed === 0) {
      await notifyCronFailure(
        `${jobLabel} - 모든 후보 skipped (fetcher 매칭 0건)`,
        `total=${result.total} skipped=${result.skipped}. DETAIL_FETCHERS applies() 점검 필요.`,
      );
    }

    return NextResponse.json({ timestamp: new Date().toISOString(), ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    await notifyCronFailure(jobLabel, message);
    return NextResponse.json({ error: "보강 실패", detail: message }, { status: 500 });
  }
}

function checkAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const fail = checkAuth(request);
  if (fail) return fail;
  return runEnrichAndRespond("enrich (POST)");
}

export async function GET(request: NextRequest) {
  const fail = checkAuth(request);
  if (fail) return fail;
  return runEnrichAndRespond("enrich (cron)");
}

export const maxDuration = 60;
