// ============================================================
// 광역 보도자료 → welfare/loan 자동 ingest (cron)
// ============================================================
// 매일 09:00 KST cron 이 호출. 후보 fetch → LLM 분류 → 자동 INSERT.
//
// 안전 가드:
//   - 24h 후보 cap (CANDIDATE_LIMIT)
//   - is_policy=false → skip
//   - apply_url=null → skip (사용자 행동 불가능)
//   - category 화이트리스트 외 → skip
//   - 중복 검사 (동일 source_id 있으면 skip — news_post 1건 중복 호출 방지)
//   - 매일 INSERT cap (INSERT_LIMIT)
//   - source_code='auto_press_ingest' (manual_admin 과 분리)
//   - admin_actions 자동 INSERT 기록
//
// 비용: 후보 30건/일 × $0.003 = $0.09/일 = ~$3/월
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-actions";
import {
  extractRegionTags,
  extractAgeTags,
  extractOccupationTags,
  extractBenefitTags,
  extractHouseholdTags,
} from "@/lib/tags/taxonomy";
import { getPressIngestCandidates } from "./filter";
import { classifyPressNews, type ClassifyResult } from "./classify";

const CANDIDATE_LIMIT = 30; // 24h 후보 cap (LLM 비용 통제)
const INSERT_LIMIT = 10; // 일 INSERT cap (오등록 폭주 방지)

const WELFARE_CATEGORIES = [
  "생계",
  "의료",
  "양육",
  "교육",
  "취업",
  "주거",
  "문화",
  "창업",
];
const LOAN_CATEGORIES = [
  "정책자금",
  "창업자금",
  "소상공인",
  "생계자금",
  "주거자금",
  "농어업",
  "기타",
];

export type IngestResult = {
  candidates: number; // 후보 N건
  classified: number; // LLM 분류 성공 K건
  inserted_welfare: number;
  inserted_loan: number;
  skipped_not_policy: number;
  skipped_no_url: number;
  skipped_bad_category: number;
  skipped_duplicate: number;
  skipped_classify_error: number;
  errors: string[];
};

// 중복 검사 — source_id 가 news_post.id 인 row 존재 여부
async function isDuplicateSourceId(
  table: "welfare_programs" | "loan_programs",
  newsPostId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("source_code", "auto_press_ingest")
    .eq("source_id", newsPostId);
  return (count ?? 0) > 0;
}

// LLM 결과 → welfare INSERT 시도
async function insertWelfare(
  newsPostId: string,
  ministry: string | null,
  result: ClassifyResult,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const admin = createAdminClient();
  const matchText = [result.title, result.target, result.eligibility]
    .filter((s): s is string => !!s)
    .join(" ");
  const { data, error } = await admin
    .from("welfare_programs")
    .insert({
      title: result.title,
      category: result.category,
      target: result.target,
      description: result.eligibility || result.benefits,
      eligibility: result.eligibility,
      benefits: result.benefits,
      apply_method: result.apply_method,
      apply_url: result.apply_url,
      apply_start: result.apply_start,
      apply_end: result.apply_end,
      source: ministry ? `${ministry}청` : "광역 보도자료",
      source_url: `https://www.keepioo.com/news/${newsPostId}`,
      region: ministry,
      source_code: "auto_press_ingest",
      source_id: newsPostId,
      region_tags: extractRegionTags(matchText),
      age_tags: extractAgeTags(matchText),
      occupation_tags: extractOccupationTags(matchText),
      benefit_tags: extractBenefitTags(matchText),
      household_target_tags: extractHouseholdTags(matchText),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

// LLM 결과 → loan INSERT 시도
async function insertLoan(
  newsPostId: string,
  ministry: string | null,
  result: ClassifyResult,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const admin = createAdminClient();
  const matchText = [result.title, result.target, result.eligibility]
    .filter((s): s is string => !!s)
    .join(" ");
  const { data, error } = await admin
    .from("loan_programs")
    .insert({
      title: result.title,
      category: result.category,
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
      source: ministry ? `${ministry}청` : "광역 보도자료",
      source_url: `https://www.keepioo.com/news/${newsPostId}`,
      source_code: "auto_press_ingest",
      source_id: newsPostId,
      region_tags: extractRegionTags(matchText),
      age_tags: extractAgeTags(matchText),
      occupation_tags: extractOccupationTags(matchText),
      benefit_tags: extractBenefitTags(matchText),
      household_target_tags: extractHouseholdTags(matchText),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

// 메인 — cron 이 호출
export async function runAutoIngest(): Promise<IngestResult> {
  const result: IngestResult = {
    candidates: 0,
    classified: 0,
    inserted_welfare: 0,
    inserted_loan: 0,
    skipped_not_policy: 0,
    skipped_no_url: 0,
    skipped_bad_category: 0,
    skipped_duplicate: 0,
    skipped_classify_error: 0,
    errors: [],
  };

  // 1) 24h 후보 fetch (cap)
  const candidates = await getPressIngestCandidates(24, CANDIDATE_LIMIT);
  result.candidates = candidates.length;

  // 2) 각 후보별 LLM 분류 + INSERT 시도 (순차 — Anthropic rate limit 보호)
  let inserted = 0;
  const admin = createAdminClient();
  for (const c of candidates) {
    if (inserted >= INSERT_LIMIT) break;

    // 이미 자동 등록된 source_id 인지 — welfare/loan 둘 다 검사
    const [welfDup, loanDup] = await Promise.all([
      isDuplicateSourceId("welfare_programs", c.id),
      isDuplicateSourceId("loan_programs", c.id),
    ]);
    if (welfDup || loanDup) {
      result.skipped_duplicate += 1;
      continue;
    }

    // LLM 분류
    let classified: ClassifyResult;
    try {
      // body 도 fetch (filter 함수는 summary 만 가져왔음)
      const { data: full } = await admin
        .from("news_posts")
        .select("body")
        .eq("id", c.id)
        .maybeSingle();
      classified = await classifyPressNews({
        title: c.title,
        summary: c.summary,
        body: (full as { body: string | null } | null)?.body ?? null,
      });
      result.classified += 1;
    } catch (e) {
      result.skipped_classify_error += 1;
      result.errors.push(`[${c.id}] classify: ${(e as Error).message}`);
      continue;
    }

    // 가드 체크
    if (!classified.is_policy) {
      result.skipped_not_policy += 1;
      continue;
    }
    if (!classified.apply_url) {
      result.skipped_no_url += 1;
      continue;
    }

    // program_type 결정 — unsure 면 skip (사장님 수동 판단 필요)
    const isWelfare =
      classified.program_type === "welfare" &&
      WELFARE_CATEGORIES.includes(classified.category);
    const isLoan =
      classified.program_type === "loan" &&
      LOAN_CATEGORIES.includes(classified.category);
    if (!isWelfare && !isLoan) {
      result.skipped_bad_category += 1;
      continue;
    }

    // INSERT
    const ins = isWelfare
      ? await insertWelfare(c.id, c.ministry, classified)
      : await insertLoan(c.id, c.ministry, classified);
    if (!ins.ok) {
      result.errors.push(`[${c.id}] insert: ${ins.error}`);
      continue;
    }

    inserted += 1;
    if (isWelfare) result.inserted_welfare += 1;
    else result.inserted_loan += 1;

    // 감사 로그 (각 INSERT 별)
    try {
      await logAdminAction({
        actorId: null, // system actor (cron 자동 — FK SET NULL 의미)
        action: "auto_press_ingest",
        details: {
          news_id: c.id,
          program_id: ins.id,
          table: isWelfare ? "welfare_programs" : "loan_programs",
          ministry: c.ministry,
          title: classified.title,
          category: classified.category,
        },
      });
    } catch (e) {
      // 감사 로그 실패는 비차단 (이미 INSERT 성공)
      result.errors.push(`[${c.id}] audit: ${(e as Error).message}`);
    }
  }

  return result;
}
