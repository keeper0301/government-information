import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-actions";
import {
  extractAgeTags,
  extractBenefitTags,
  extractHouseholdTags,
  extractOccupationTags,
  extractRegionTags,
} from "@/lib/tags/taxonomy";
import type { ClassifyResult } from "./classify";
import {
  detectProvince,
  extractDistrictFromFields,
} from "@/lib/region/district-extractor";
import { PROVINCES } from "@/lib/regions";
// 4 layer apply_url fallback — autoConfirm 단계에서 기존 pending 도 자동 채움.
import { resolveApplyUrl } from "./url-fallback";
// Spec 1 — 학습된 tier_floor 조회 (env > DB > 'high' default)
import { getCurrentTierFloor } from "./auto-confirm-settings";

export type PressCandidateStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "skipped"
  | "failed"
  | "revoked"; // 자동 등록 후 사장님이 회수한 상태 (is_hidden=true 와 한 쌍)

export type PressCandidateProgramType =
  | "welfare"
  | "loan"
  | "unsure"
  | "not_policy";

export type PressCandidateUpsert = {
  news_id: string;
  status: PressCandidateStatus;
  program_type: PressCandidateProgramType;
  title: string;
  category: string | null;
  classified_payload: ClassifyResult;
  skip_reason: string | null;
  error_message?: string | null;
  classified_at: string;
  updated_at: string;
  // Task 3 — LLM 분류 신뢰도 보존. autoConfirm 단계에서 임계 미만은 사장님 검토 큐로 보낸다.
  // is_policy=false (skipped) 후보는 자동 confirm 대상이 아니므로 null.
  confidence_tier: "high" | "mid" | "low" | null;
};

type PressCandidateDbUpsert = Omit<PressCandidateUpsert, "classified_payload"> & {
  classified_payload: ClassifyResult | Record<string, never>;
};

export type PressCandidateForConfirm = {
  id: string;
  news_id: string;
  status: PressCandidateStatus;
  program_type: PressCandidateProgramType;
  title: string;
  category: string | null;
  classified_payload: ClassifyResult;
  news: {
    id: string;
    ministry: string | null;
    slug: string | null;
  };
};

export type PressCandidateListRow = PressCandidateForConfirm & {
  skip_reason: string | null;
  error_message: string | null;
  classified_at: string;
  created_at: string;
  updated_at: string;
  confidence_tier: "high" | "mid" | "low" | null;
};

type PressCandidateDbRow = {
  id: string;
  news_id: string;
  status: PressCandidateStatus;
  program_type: PressCandidateProgramType;
  title: string;
  category: string | null;
  classified_payload: ClassifyResult;
  skip_reason?: string | null;
  error_message?: string | null;
  classified_at?: string;
  created_at?: string;
  updated_at?: string;
  confidence_tier?: "high" | "mid" | "low" | null;
  news_posts: {
    id: string;
    ministry: string | null;
    slug: string | null;
  };
};

const SOURCE_CODE = "press_l2_confirm";

function ministryToSource(ministry: string | null): string {
  return ministry ? `${ministry}청` : "광역 보도자료";
}

export function newsSourceUrl(news: { id: string; slug: string | null }): string {
  return `https://www.keepioo.com/news/${encodeURIComponent(news.slug || news.id)}`;
}

function classifyStatus(result: ClassifyResult): {
  status: PressCandidateStatus;
  programType: PressCandidateProgramType;
  skipReason: string | null;
  // Task 3 — autoConfirm 단계에서 tier filter 분기 입력으로 사용.
  // welfare/loan pending 만 LLM confidence 보존, 그 외 (skipped) 는 null.
  confidenceTier: "high" | "mid" | "low" | null;
} {
  if (!result.is_policy) {
    return {
      status: "skipped",
      programType: "not_policy",
      skipReason: "not_policy",
      confidenceTier: null,
    };
  }
  if (result.program_type === "welfare" || result.program_type === "loan") {
    return {
      status: "pending",
      programType: result.program_type,
      skipReason: null,
      confidenceTier: result.confidence,
    };
  }
  return {
    status: "skipped",
    programType: "unsure",
    skipReason: "program_type_unsure",
    confidenceTier: null,
  };
}

export function buildCandidateUpsert({
  newsId,
  result,
}: {
  newsId: string;
  result: ClassifyResult;
}): PressCandidateUpsert {
  const { status, programType, skipReason, confidenceTier } = classifyStatus(result);
  const now = new Date().toISOString();
  return {
    news_id: newsId,
    status,
    program_type: programType,
    title: result.title,
    category: result.category || null,
    classified_payload: result,
    skip_reason: skipReason,
    error_message: null,
    classified_at: now,
    updated_at: now,
    confidence_tier: confidenceTier,
  };
}

export function buildFailedCandidateUpsert({
  newsId,
  title,
  error,
}: {
  newsId: string;
  title: string;
  error: string;
}): Omit<PressCandidateUpsert, "classified_payload"> & {
  classified_payload: Record<string, never>;
} {
  const now = new Date().toISOString();
  return {
    news_id: newsId,
    status: "failed",
    program_type: "unsure",
    title,
    category: null,
    classified_payload: {},
    skip_reason: "classify_error",
    error_message: error.slice(0, 1000),
    classified_at: now,
    updated_at: now,
    // 분류 실패 자체로는 신뢰도 측정 불가 → null. 자동 confirm 대상에서도 자연 제외.
    confidence_tier: null,
  };
}

// Task 4 — tier 비교 우선순위. 숫자가 클수록 신뢰도 높음.
// AUTO_CONFIRM_TIER_FLOOR 가 'mid' 면 tier rank >= 2 (high·mid) 만 자동 confirm.
const TIER_RANK = { high: 3, mid: 2, low: 1 } as const;

/**
 * tier 자동 confirm 분기. floor 결정 우선순위:
 * - floorOverride 인자 (caller 가 DB 학습값 주입) — Spec 1 자가 진화 학습
 * - process.env.AUTO_CONFIRM_TIER_FLOOR — 긴급 override
 * - 'high' default — invalid env 또는 미설정
 *
 * tier=null (legacy 후보 또는 신뢰도 측정 불가) → 항상 false.
 *
 * 호출처:
 *   - autoConfirmPendingPressCandidates (cron) — getCurrentTierFloor() 결과 주입
 *   - 테스트 — floorOverride 생략, env 만 사용
 */
export function shouldAutoConfirm(
  tier: "high" | "mid" | "low" | null,
  floorOverride?: "high" | "mid" | "low",
): boolean {
  if (tier === null) return false;
  let floor: "high" | "mid" | "low";
  if (floorOverride) {
    floor = floorOverride;
  } else {
    const raw = process.env.AUTO_CONFIRM_TIER_FLOOR ?? "high";
    floor = (["high", "mid", "low"] as const).includes(
      raw as "high" | "mid" | "low",
    )
      ? (raw as "high" | "mid" | "low")
      : "high";
  }
  return TIER_RANK[tier] >= TIER_RANK[floor];
}

function requirePending(candidate: PressCandidateForConfirm, expected: "welfare" | "loan") {
  if (candidate.status !== "pending") {
    throw new Error("pending 후보만 확정할 수 있습니다.");
  }
  if (candidate.program_type !== expected) {
    throw new Error(`${expected} 후보가 아닙니다.`);
  }
  if (!candidate.classified_payload.apply_url) {
    throw new Error("신청 URL 이 없는 후보는 확정할 수 없습니다.");
  }
}

function extractTags(result: ClassifyResult) {
  const matchText = [result.title, result.target, result.eligibility, result.benefits]
    .filter((s): s is string => !!s)
    .join(" ");
  return {
    region_tags: extractRegionTags(matchText),
    age_tags: extractAgeTags(matchText),
    occupation_tags: extractOccupationTags(matchText),
    benefit_tags: extractBenefitTags(matchText),
    household_target_tags: extractHouseholdTags(matchText),
  };
}

// Task 4 — auto_confirm_tier / auto_confirmed_at 메타를 INSERT payload 에 동봉.
// options.autoConfirmTier 가 'high' / 'mid' 면 자동 등록 마킹, null 이면 사장님 수동 confirm 으로 간주.
// DDL 077 의 welfare_programs / loan_programs 컬럼이 이 두 필드를 받는다.
export function buildWelfareInsertPayload(
  candidate: PressCandidateForConfirm,
  options?: { autoConfirmTier?: "high" | "mid" | null },
) {
  requirePending(candidate, "welfare");
  const result = candidate.classified_payload;
  const autoTier = options?.autoConfirmTier ?? null;
  // 시·군·구 자동 추출 (migration 090, 2026-05-16) — 사장님 거주지 정확 매칭용
  const districtMatch = extractDistrictFromFields(
    result.title,
    result.eligibility,
    result.benefits,
    result.target,
    candidate.news.ministry,
  );
  return {
    title: result.title,
    category: candidate.category || result.category,
    target: result.target,
    description: result.eligibility || result.benefits,
    eligibility: result.eligibility,
    benefits: result.benefits,
    apply_method: result.apply_method,
    apply_url: result.apply_url,
    apply_start: result.apply_start,
    apply_end: result.apply_end,
    source: ministryToSource(candidate.news.ministry),
    source_url: newsSourceUrl(candidate.news),
    region: candidate.news.ministry,
    district: districtMatch?.district ?? null,
    source_code: SOURCE_CODE,
    source_id: candidate.news_id,
    auto_confirm_tier: autoTier,
    auto_confirmed_at: autoTier ? new Date().toISOString() : null,
    ...extractTags(result),
  };
}

export function buildLoanInsertPayload(
  candidate: PressCandidateForConfirm,
  options?: { autoConfirmTier?: "high" | "mid" | null },
) {
  requirePending(candidate, "loan");
  const result = candidate.classified_payload;
  const autoTier = options?.autoConfirmTier ?? null;
  // loan 은 region 도 추출 (migration 090 신설). 시·군 매칭이 없어도 광역만
  // 별도 detectProvince 로 추출 — extractor 가 시·군 없으면 null 반환하기 때문.
  const districtMatch = extractDistrictFromFields(
    result.title,
    result.eligibility,
    result.target,
    candidate.news.ministry,
  );
  const provinceCode =
    districtMatch?.province ??
    detectProvince(
      [result.title, result.eligibility, result.target, candidate.news.ministry]
        .filter((s): s is string => !!s)
        .join(" "),
    );
  const provinceName =
    districtMatch?.provinceName ??
    (provinceCode ? PROVINCES.find((p) => p.code === provinceCode)?.name ?? null : null);
  return {
    title: result.title,
    category: candidate.category || result.category,
    target: result.target,
    description: result.eligibility || result.benefits,
    eligibility: result.eligibility,
    loan_amount: result.loan_amount ?? null,
    interest_rate: result.interest_rate ?? null,
    repayment_period: result.repayment_period ?? null,
    apply_method: result.apply_method,
    apply_url: result.apply_url,
    apply_start: result.apply_start,
    apply_end: result.apply_end,
    source: ministryToSource(candidate.news.ministry),
    source_url: newsSourceUrl(candidate.news),
    region: provinceName,
    district: districtMatch?.district ?? null,
    source_code: SOURCE_CODE,
    source_id: candidate.news_id,
    auto_confirm_tier: autoTier,
    auto_confirmed_at: autoTier ? new Date().toISOString() : null,
    ...extractTags(result),
  };
}

export async function getExistingPressCandidate(newsId: string): Promise<{
  id: string;
  status: PressCandidateStatus;
} | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("press_ingest_candidates")
    .select("id, status")
    .eq("news_id", newsId)
    .maybeSingle();
  if (error) throw new Error(`press 후보 조회 실패: ${error.message}`);
  return (data ?? null) as { id: string; status: PressCandidateStatus } | null;
}

export async function upsertPressCandidate(input: PressCandidateDbUpsert): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("press_ingest_candidates")
    .upsert(input, { onConflict: "news_id" });
  if (error) throw new Error(`press 후보 저장 실패: ${error.message}`);
}

export async function listPressCandidates(
  limit = 100,
  opts?: { tier?: "low" | "mid" | "high" },
): Promise<PressCandidateListRow[]> {
  const admin = createAdminClient();
  let query = admin
    .from("press_ingest_candidates")
    .select(
      "id, news_id, status, program_type, title, category, classified_payload, skip_reason, error_message, classified_at, created_at, updated_at, confidence_tier, news_posts!inner(id, ministry, slug)",
    )
    .eq("status", "pending");
  if (opts?.tier) {
    query = query.eq("confidence_tier", opts.tier);
  }
  const { data, error } = await query
    .order("classified_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[press-ingest:candidates] 후보 조회 실패:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as PressCandidateDbRow[]).map((row) => ({
    id: row.id,
    news_id: row.news_id,
    status: row.status,
    program_type: row.program_type,
    title: row.title,
    category: row.category,
    classified_payload: row.classified_payload,
    skip_reason: row.skip_reason ?? null,
    error_message: row.error_message ?? null,
    classified_at: row.classified_at ?? "",
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
    confidence_tier: row.confidence_tier ?? null,
    news: {
      id: row.news_posts.id,
      ministry: row.news_posts.ministry,
      slug: row.news_posts.slug,
    },
  }));
}

export async function getPressCandidateForConfirm(
  candidateId: string,
): Promise<PressCandidateForConfirm | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("press_ingest_candidates")
    .select(
      "id, news_id, status, program_type, title, category, classified_payload, news_posts!inner(id, ministry, slug)",
    )
    .eq("id", candidateId)
    .maybeSingle();
  if (error) throw new Error(`press 후보 조회 실패: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as PressCandidateDbRow;
  return {
    id: row.id,
    news_id: row.news_id,
    status: row.status,
    program_type: row.program_type,
    title: row.title,
    category: row.category,
    classified_payload: row.classified_payload,
    news: {
      id: row.news_posts.id,
      ministry: row.news_posts.ministry,
      slug: row.news_posts.slug,
    },
  };
}

export async function confirmPressCandidate(
  candidateId: string,
  actorId: string | null,
  options?: { autoConfirmTier?: "high" | "mid" | null },
): Promise<{ table: "welfare_programs" | "loan_programs"; id: string }> {
  const candidate = await getPressCandidateForConfirm(candidateId);
  if (!candidate) throw new Error("후보를 찾을 수 없습니다.");
  const admin = createAdminClient();
  const table =
    candidate.program_type === "welfare" ? "welfare_programs" : "loan_programs";
  const payload =
    candidate.program_type === "welfare"
      ? buildWelfareInsertPayload(candidate, options)
      : buildLoanInsertPayload(candidate, options);
  const now = new Date().toISOString();

  const { error: claimError } = await admin
    .from("press_ingest_candidates")
    .update({
      status: "confirmed",
      confirmed_at: now,
      confirmed_by: actorId,
      updated_at: now,
    })
    .eq("id", candidateId)
    .eq("status", "pending")
    .select("id")
    .single();
  if (claimError) {
    throw new Error(`후보 승인 선점 실패: ${claimError.message}`);
  }

  const { data, error } = await admin.from(table).insert(payload).select("id").single();
  if (error) {
    await admin
      .from("press_ingest_candidates")
      .update({
        status: "pending",
        confirmed_at: null,
        confirmed_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
    throw new Error(`정책 등록 실패: ${error.message}`);
  }

  const { error: updateError } = await admin
    .from("press_ingest_candidates")
    .update({
      confirmed_program_table: table,
      confirmed_program_id: data.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId)
    .eq("status", "confirmed");
  if (updateError) throw new Error(`후보 상태 갱신 실패: ${updateError.message}`);

  await logAdminAction({
    actorId,
    action: "press_l2_confirm",
    details: {
      candidate_id: candidateId,
      news_id: candidate.news_id,
      table,
      program_id: data.id,
      title: candidate.title,
      category: candidate.category,
    },
  });

  return { table, id: data.id as string };
}

export type AutoConfirmLayerBreakdown = {
  llm: number;
  body_urls: number;
  body_regex: number;
  province: number;
  source_url: number;
};

export type AutoConfirmResult = {
  /** 자동 승인된 후보 수 (fallback 으로 url 채워 INSERT 성공) */
  confirmed: number;
  /** 4 layer fallback 으로 url 채운 후보 수 (확인 통계용) */
  fallback_filled: number;
  /** Layer 별 회수 분포 — 운영 가시성 (사장님이 광역 매핑 의존도 확인 가능). LLM 직접 응답이 0 이면 prompt 재검토 신호. */
  layer_breakdown: AutoConfirmLayerBreakdown;
  /** apply_url 없어 자동 승인 보류 — fallback 후에도 url 0 인 사례 (이론상 거의 0) */
  skipped_no_url: number;
  /** confirm 도중 실패한 후보별 에러 (DB / RLS / payload 검증 등) */
  errors: { candidate_id: string; message: string }[];
};

type AutoConfirmRow = {
  id: string;
  classified_payload: ClassifyResult;
  // Task 4 — tier filter 분기 입력. shouldAutoConfirm 으로 floor 비교.
  confidence_tier: "high" | "mid" | "low" | null;
  news_posts: {
    id: string;
    slug: string | null;
    ministry: string | null;
    body: string | null;
  };
};

/**
 * pending + welfare/loan 후보를 일괄 자동 승인.
 *
 * 사용 위치: cron (`runAutoIngest` 끝) — KST 10:30/15:30/19:30 자동 처리.
 * cap 만큼만 처리해 갑작스런 데이터 변화/캐시 폭주를 방지하고,
 * 적체된 pending 큐를 점진적으로 해소한다 (오래된 것부터).
 *
 * 가드:
 *  - apply_url null/empty → 4 layer fallback (LLM body_urls / 본문 정규식 / 광역 매핑 / source_url)
 *    으로 자동 채우고 classified_payload jsonb update 후 confirm.
 *    → 사장님 수동 검토 부담 거의 0. fallback url 화이트리스트로 광고·외부 사이트 차단.
 *  - program_type=unsure/not_policy 는 애초에 skipped 라 자동 승인 대상에서 제외.
 *  - actorId=null 로 confirmPressCandidate 호출 → confirmed_by=NULL + admin_actions actor=null
 *    (system 자동 승인 출처 명확히 기록 — 추후 감사·롤백 시 수동 vs 자동 구분).
 */
export async function autoConfirmPendingPressCandidates({
  limit = 50,
}: { limit?: number } = {}): Promise<AutoConfirmResult> {
  const admin = createAdminClient();
  // Spec 1 — DB 학습값 (press_auto_confirm_settings) 을 env 보다 우선 적용.
  // cron 한 사이클 동안 동일 floor 유지 → row 별 추가 DB 조회 없음.
  const currentFloor = await getCurrentTierFloor();
  // news_posts 의 body·ministry + 후보의 confidence_tier 까지 select.
  // tier 분기 (Task 4) + fallback chain 입력 (Task 2 직전 작업) 둘 다 필요.
  const { data, error } = await admin
    .from("press_ingest_candidates")
    .select(
      "id, classified_payload, confidence_tier, news_posts!inner(id, slug, ministry, body)",
    )
    .eq("status", "pending")
    .in("program_type", ["welfare", "loan"])
    .order("classified_at", { ascending: true })
    .limit(limit);
  if (error) {
    throw new Error(`자동 승인 후보 조회 실패: ${error.message}`);
  }
  const result: AutoConfirmResult = {
    confirmed: 0,
    fallback_filled: 0,
    layer_breakdown: {
      llm: 0,
      body_urls: 0,
      body_regex: 0,
      province: 0,
      source_url: 0,
    },
    skipped_no_url: 0,
    errors: [],
  };
  for (const row of ((data ?? []) as unknown as AutoConfirmRow[])) {
    // Task 4 — 신뢰도 tier 분기. floor 미만 (default: low) 은 pending 큐에 유지해
    // 사장님이 /admin/press-ingest 에서 직접 검토하도록 한다.
    // tier=null (legacy 후보) 은 항상 보수적으로 자동 confirm 제외.
    const tier = (row.confidence_tier ?? null) as
      | "high"
      | "mid"
      | "low"
      | null;
    if (!shouldAutoConfirm(tier, currentFloor)) {
      continue;
    }
    let applyUrl = row.classified_payload?.apply_url ?? null;

    // apply_url 없으면 4 layer fallback 적용 + classified_payload jsonb update.
    // confirmPressCandidate 가 candidate fetch 시 갱신된 payload 를 쓰므로 INSERT payload 의
    // apply_url 도 새 url 로 채워짐.
    if (!applyUrl) {
      const fallback = resolveApplyUrl({
        llmApplyUrl: null,
        bodyUrls: row.classified_payload?.body_urls ?? [],
        body: row.news_posts.body,
        ministry: row.news_posts.ministry,
        sourceUrl: newsSourceUrl({
          id: row.news_posts.id,
          slug: row.news_posts.slug,
        }),
      });
      applyUrl = fallback.url;

      const updatedPayload: ClassifyResult = {
        ...row.classified_payload,
        apply_url: applyUrl,
      };
      const { error: updateErr } = await admin
        .from("press_ingest_candidates")
        .update({
          classified_payload: updatedPayload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updateErr) {
        result.errors.push({
          candidate_id: row.id,
          message: `payload update: ${updateErr.message.slice(0, 300)}`,
        });
        continue;
      }
      result.fallback_filled += 1;
      result.layer_breakdown[fallback.source] += 1;
    } else {
      // LLM 이 직접 apply_url 응답 — Layer 1 통계
      result.layer_breakdown.llm += 1;
    }

    if (!applyUrl) {
      // Layer 5 source_url 까지 항상 url 채워지므로 여기는 도달 거의 X (방어적)
      result.skipped_no_url += 1;
      continue;
    }

    try {
      // 자동 confirm 메타 (auto_confirm_tier / auto_confirmed_at) 동봉.
      // shouldAutoConfirm 통과 시 tier 는 항상 high/mid (low 는 floor 기본값에서 제외).
      // floor='low' 운영 시에도 low 가 들어올 수 있으나 buildXInsertPayload 의
      // autoConfirmTier 타입이 'high' | 'mid' | null 이라 low 는 null 로 마킹.
      await confirmPressCandidate(row.id, null, {
        autoConfirmTier: tier === "high" || tier === "mid" ? tier : null,
      });
      result.confirmed += 1;
    } catch (e) {
      result.errors.push({
        candidate_id: row.id,
        message: (e as Error).message.slice(0, 300),
      });
    }
  }
  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 자동 등록된 정책 회수 / 복원
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM 신뢰도 high/mid 자동 등록된 정책 중 사장님이 잘못 분류 발견 시 1클릭 회수.
// is_hidden=true 로 사용자 노출 즉시 차단 (RLS USING (is_hidden=false)).
// FK·즐겨찾기 유지 — 데이터 손실 0. 사장님 의도와 system 의도 구분 위해 actorId audit.

export type RevokePayload = {
  is_hidden: true;
  revoked_at: string;
  revoked_by: string | null;
  updated_at: string;
};

/**
 * 자동 등록 정책 회수 시 welfare/loan row UPDATE 에 사용할 payload.
 * pure function — 시점·actor 만 받아 객체 반환. DB 호출 X.
 */
export function buildRevokePayload({ actorId }: { actorId: string | null }): RevokePayload {
  const now = new Date().toISOString();
  return {
    is_hidden: true,
    revoked_at: now,
    revoked_by: actorId,
    updated_at: now,
  };
}

export type RestorePayload = {
  is_hidden: false;
  revoked_at: null;
  revoked_by: null;
  updated_at: string;
};

/**
 * 잘못 회수한 정책 복원 — is_hidden=false + 회수 audit clear.
 */
export function buildRestorePayload(): RestorePayload {
  return {
    is_hidden: false,
    revoked_at: null,
    revoked_by: null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * 자동 등록된 정책 회수 — welfare/loan row 의 is_hidden=true + revoked_at/by 토글.
 * candidate status='revoked' 로 이동 + admin_actions.press_l2_auto_revoke audit.
 *
 * actorId=null 이면 system 회수 (예: cron 자동 회수, 미래 가능). 사장님 회수는 actorId=auth user.
 */
export async function revokeAutoConfirmed({
  candidateId,
  actorId,
}: {
  candidateId: string;
  actorId: string | null;
}): Promise<{ table: "welfare_programs" | "loan_programs"; programId: string }> {
  const admin = createAdminClient();

  // candidate 조회 — confirmed_program_table·confirmed_program_id 로 정확히 row 찾음
  const { data, error } = await admin
    .from("press_ingest_candidates")
    .select(
      "id, status, confirmed_program_table, confirmed_program_id, confidence_tier",
    )
    .eq("id", candidateId)
    .maybeSingle();
  if (error) throw new Error(`회수 후보 조회 실패: ${error.message}`);
  if (!data) throw new Error("후보를 찾을 수 없습니다.");
  if (data.status !== "confirmed") {
    throw new Error(`회수는 confirmed 상태만 가능합니다 (현재: ${data.status}).`);
  }
  if (!data.confirmed_program_table || !data.confirmed_program_id) {
    throw new Error("등록된 정책 정보가 없는 후보입니다.");
  }

  const table = data.confirmed_program_table as "welfare_programs" | "loan_programs";
  const programId = data.confirmed_program_id as string;

  // welfare/loan row toggle
  const revoke = buildRevokePayload({ actorId });
  const { error: hideErr } = await admin.from(table).update(revoke).eq("id", programId);
  if (hideErr) throw new Error(`정책 hidden 토글 실패: ${hideErr.message}`);

  // candidate status → 'revoked'
  const { error: candErr } = await admin
    .from("press_ingest_candidates")
    .update({ status: "revoked", updated_at: revoke.updated_at })
    .eq("id", candidateId);
  if (candErr) {
    // candidate update 실패 — welfare/loan 의 hidden 토글 rollback
    // (idempotent retry 위해 — 다음 회수 시 status 가드 통과 가능하도록)
    await admin.from(table).update(buildRestorePayload()).eq("id", programId);
    throw new Error(`후보 상태 갱신 실패: ${candErr.message}`);
  }

  // audit
  await logAdminAction({
    actorId,
    action: "press_l2_auto_revoke",
    details: {
      candidate_id: candidateId,
      table,
      program_id: programId,
      auto_confirm_tier: data.confidence_tier,
    },
  });

  return { table, programId };
}

/**
 * 잘못 회수한 정책 복원 — is_hidden=false + revoked_at/by null + candidate status='confirmed'.
 */
export async function restoreAutoConfirmed({
  candidateId,
  actorId,
}: {
  candidateId: string;
  actorId: string | null;
}): Promise<{ table: "welfare_programs" | "loan_programs"; programId: string }> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("press_ingest_candidates")
    .select(
      "id, status, confirmed_program_table, confirmed_program_id, confidence_tier",
    )
    .eq("id", candidateId)
    .maybeSingle();
  if (error) throw new Error(`복원 후보 조회 실패: ${error.message}`);
  if (!data) throw new Error("후보를 찾을 수 없습니다.");
  if (data.status !== "revoked") {
    throw new Error(`복원은 revoked 상태만 가능합니다 (현재: ${data.status}).`);
  }
  if (!data.confirmed_program_table || !data.confirmed_program_id) {
    throw new Error("등록된 정책 정보가 없는 후보입니다.");
  }

  const table = data.confirmed_program_table as "welfare_programs" | "loan_programs";
  const programId = data.confirmed_program_id as string;
  const restore = buildRestorePayload();

  const { error: hideErr } = await admin.from(table).update(restore).eq("id", programId);
  if (hideErr) throw new Error(`정책 복원 토글 실패: ${hideErr.message}`);

  const { error: candErr } = await admin
    .from("press_ingest_candidates")
    .update({ status: "confirmed", updated_at: restore.updated_at })
    .eq("id", candidateId);
  if (candErr) {
    // candidate update 실패 — welfare/loan 을 다시 hidden 으로 rollback
    // (idempotent retry 위해 — 다음 복원 시 status 가드 통과 가능하도록)
    await admin.from(table).update(buildRevokePayload({ actorId })).eq("id", programId);
    throw new Error(`후보 상태 갱신 실패: ${candErr.message}`);
  }

  await logAdminAction({
    actorId,
    action: "press_l2_auto_restore",
    details: {
      candidate_id: candidateId,
      table,
      program_id: programId,
      auto_confirm_tier: data.confidence_tier,
    },
  });

  return { table, programId };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /admin/auto-confirmed 페이지용 — 자동 등록 정책 목록 (회수 포함)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM 신뢰도 high·mid 로 자동 등록된 welfare/loan 정책을 N일 윈도우로 모은다.
// is_hidden=true 인 회수된 row 도 포함 (사장님이 잘못 회수했을 때 복원 가능).
// 페이지에서 후보 단위로 회수/복원 액션을 호출하므로 candidate_id 매핑 포함.

export type AutoConfirmedRow = {
  candidate_id: string;
  table: "welfare_programs" | "loan_programs";
  program_id: string;
  title: string;
  // welfare 는 region, loan 은 source 를 동일 슬롯으로 노출 (UI 가독성 통일)
  ministry: string | null;
  auto_confirm_tier: "high" | "mid";
  auto_confirmed_at: string;
  is_hidden: boolean;
  revoked_at: string | null;
};

/**
 * /admin/auto-confirmed 페이지용 fetcher.
 * 최근 sinceDays 안에 auto_confirmed_at 마킹된 welfare/loan row 조회 (회수 포함).
 * candidate_id 는 confirmed_program_id 로 역매핑 — 회수/복원 액션이 candidate 단위라 필수.
 */
export async function listAutoConfirmedPolicies({
  sinceDays,
}: { sinceDays: number }): Promise<AutoConfirmedRow[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const [welfare, loan] = await Promise.all([
    admin
      .from("welfare_programs")
      .select(
        "id, title, region, auto_confirm_tier, auto_confirmed_at, is_hidden, revoked_at",
      )
      .gte("auto_confirmed_at", since)
      .order("auto_confirmed_at", { ascending: false }),
    admin
      .from("loan_programs")
      .select(
        "id, title, source, auto_confirm_tier, auto_confirmed_at, is_hidden, revoked_at",
      )
      .gte("auto_confirmed_at", since)
      .order("auto_confirmed_at", { ascending: false }),
  ]);

  const programIds = [
    ...((welfare.data ?? []) as Array<{ id: string }>).map((r) => r.id),
    ...((loan.data ?? []) as Array<{ id: string }>).map((r) => r.id),
  ];
  if (programIds.length === 0) return [];

  // candidate 역매핑 — confirmed_program_id 가 unique 라 1:1 안전
  const { data: candidates } = await admin
    .from("press_ingest_candidates")
    .select("id, confirmed_program_id, confirmed_program_table")
    .in("confirmed_program_id", programIds);

  const candByProgramId = new Map<string, string>();
  for (const c of (candidates ?? []) as Array<{
    id: string;
    confirmed_program_id: string | null;
  }>) {
    if (c.confirmed_program_id) candByProgramId.set(c.confirmed_program_id, c.id);
  }

  const rows: AutoConfirmedRow[] = [];
  for (const w of (welfare.data ?? []) as Array<{
    id: string;
    title: string;
    region: string | null;
    auto_confirm_tier: string;
    auto_confirmed_at: string;
    is_hidden: boolean;
    revoked_at: string | null;
  }>) {
    const cid = candByProgramId.get(w.id);
    if (!cid) continue;
    rows.push({
      candidate_id: cid,
      table: "welfare_programs",
      program_id: w.id,
      title: w.title,
      ministry: w.region ?? null,
      auto_confirm_tier: w.auto_confirm_tier as "high" | "mid",
      auto_confirmed_at: w.auto_confirmed_at,
      is_hidden: w.is_hidden,
      revoked_at: w.revoked_at,
    });
  }
  for (const l of (loan.data ?? []) as Array<{
    id: string;
    title: string;
    source: string | null;
    auto_confirm_tier: string;
    auto_confirmed_at: string;
    is_hidden: boolean;
    revoked_at: string | null;
  }>) {
    const cid = candByProgramId.get(l.id);
    if (!cid) continue;
    rows.push({
      candidate_id: cid,
      table: "loan_programs",
      program_id: l.id,
      title: l.title,
      ministry: l.source ?? null,
      auto_confirm_tier: l.auto_confirm_tier as "high" | "mid",
      auto_confirmed_at: l.auto_confirmed_at,
      is_hidden: l.is_hidden,
      revoked_at: l.revoked_at,
    });
  }
  // 두 테이블 합친 후 최신순 정렬 (table 별 order 가 합쳐지면 깨짐)
  rows.sort((a, b) => b.auto_confirmed_at.localeCompare(a.auto_confirmed_at));
  return rows;
}

/**
 * 정책 ID 로 자동 등록 candidate 찾음. /welfare/[id]·/loan/[id] 의 admin 배지에서 사용.
 * candidate 가 confirmed/revoked 상태가 아니면 (예: pending/rejected) 배지 노출 안 함.
 * 회수 후 status='revoked' 도 포함해 admin 이 복원 버튼 볼 수 있도록 함.
 */
export async function findCandidateByProgramId({
  table,
  programId,
}: {
  table: "welfare_programs" | "loan_programs";
  programId: string;
}): Promise<{ candidateId: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("press_ingest_candidates")
    .select("id")
    .eq("confirmed_program_table", table)
    .eq("confirmed_program_id", programId)
    .in("status", ["confirmed", "revoked"])
    .maybeSingle();
  return data ? { candidateId: data.id as string } : null;
}

// actorId=null 은 system/텔레그램 봇 출처 — admin_actions.actor_id 가 nullable.
export async function rejectPressCandidate(
  candidateId: string,
  actorId: string | null,
): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("press_ingest_candidates")
    .update({
      status: "rejected",
      rejected_at: now,
      rejected_by: actorId,
      updated_at: now,
    })
    .eq("id", candidateId)
    .eq("status", "pending");
  if (error) throw new Error(`후보 해제 실패: ${error.message}`);
  await logAdminAction({
    actorId,
    action: "press_l2_reject",
    details: { candidate_id: candidateId },
  });
}

// 2026-05-18 — 제목 유사 묶음 자동 detection (cleanup 우선순위 가시화).
// 사장님 검수 큐 정리 시 "고유가 피해지원금" 4건 같은 중복 묶음 1 click 처리.
// 알고리즘: title normalize (공백·괄호·하이픈 제거 + lowercase) → 첫 8자 grouping.
// 8자 기준은 한국어 정책명 (도시명 + 정책 키워드) 의 핵심 식별 영역.
export type TitleDupeGroup = {
  /** normalized prefix (debug + UI key) */
  key: string;
  /** 묶음 첫 후보 title (UI 표시) */
  sampleTitle: string;
  /** 묶음 ids */
  ids: string[];
  /** 묶음 크기 */
  count: number;
};

export function normalizeTitleForDupe(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()\-_·,.\[\]【】]/g, "")
    .slice(0, 8);
}

export function groupCandidatesByTitle(
  rows: { id: string; title: string }[],
  minGroupSize = 2,
): TitleDupeGroup[] {
  const groups = new Map<string, { sample: string; ids: string[] }>();
  for (const row of rows) {
    const key = normalizeTitleForDupe(row.title);
    if (key.length === 0) continue;
    const existing = groups.get(key);
    if (existing) {
      existing.ids.push(row.id);
    } else {
      groups.set(key, { sample: row.title, ids: [row.id] });
    }
  }
  return Array.from(groups.entries())
    .filter(([, v]) => v.ids.length >= minGroupSize)
    .map(([key, v]) => ({
      key,
      sampleTitle: v.sample,
      ids: v.ids,
      count: v.ids.length,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function detectPendingTitleDupeGroups(opts?: {
  minGroupSize?: number;
}): Promise<TitleDupeGroup[]> {
  const minGroupSize = opts?.minGroupSize ?? 2;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("press_ingest_candidates")
      .select("id, title")
      .eq("status", "pending")
      .limit(500);
    if (error || !data) return [];
    return groupCandidatesByTitle(
      data as { id: string; title: string }[],
      minGroupSize,
    );
  } catch {
    return [];
  }
}

// 2026-05-18 — legacy null + 묵음 7일+ pending 개수 (UI 가드 + cleanup 후보).
export async function countLegacyPendingPressCandidates(opts?: {
  olderThanHours?: number;
}): Promise<number> {
  const olderThanHours = opts?.olderThanHours ?? 168;
  const cutoff = new Date(Date.now() - olderThanHours * 3600_000).toISOString();
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("press_ingest_candidates")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .is("confidence_tier", null)
    .lt("created_at", cutoff);
  if (error) {
    console.warn("[press-ingest] legacy count 실패:", error.message);
    return 0;
  }
  return count ?? 0;
}

// 2026-05-18 — 5/9 가동 전 legacy 후보 (confidence_tier IS NULL) 일괄 정리.
// 5/9~ 메모리 [press-tier-1week-monitoring-2026-05-10] 의 1주차 마감 시점 정리.
// tier=null = LLM 신뢰도 측정 불가능 = 자동 confirm 영구 X = 사장님 수동 처리 외
// 옵션 없음. 신선도 ↓ row 누적 → /admin/press-ingest 큐 사장님 가독성 ↓.
// 묵음 7일+ + tier IS NULL 만 대상 — mid/low 신규 후보는 영향 0.
export async function bulkRejectLegacyPressCandidates(
  actorId: string | null,
  opts?: { olderThanHours?: number },
): Promise<{ rejected: number; ids: string[] }> {
  const olderThanHours = opts?.olderThanHours ?? 168; // 기본 7일
  const cutoff = new Date(Date.now() - olderThanHours * 3600_000).toISOString();
  const admin = createAdminClient();

  // 대상 row 먼저 select — audit 에 ids 남기기.
  const { data: targets, error: selectErr } = await admin
    .from("press_ingest_candidates")
    .select("id")
    .eq("status", "pending")
    .is("confidence_tier", null)
    .lt("created_at", cutoff);
  if (selectErr) throw new Error(`legacy 후보 조회 실패: ${selectErr.message}`);
  const ids = (targets ?? []).map((r) => r.id as string);
  if (ids.length === 0) return { rejected: 0, ids: [] };

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("press_ingest_candidates")
    .update({
      status: "rejected",
      rejected_at: now,
      rejected_by: actorId,
      updated_at: now,
    })
    .in("id", ids)
    .eq("status", "pending"); // race condition 가드 (다른 사장님 액션 중복 방지)
  if (updateErr) throw new Error(`legacy 후보 일괄 해제 실패: ${updateErr.message}`);

  await logAdminAction({
    actorId,
    action: "press_l2_reject",
    details: {
      bulk: true,
      reason: "legacy_null_tier_stale",
      older_than_hours: olderThanHours,
      rejected_count: ids.length,
      candidate_ids: ids,
    },
  });

  return { rejected: ids.length, ids };
}
