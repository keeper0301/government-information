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

export type PressCandidateStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "skipped"
  | "failed";

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

function newsSourceUrl(news: { id: string; slug: string | null }): string {
  return `https://www.keepioo.com/news/${encodeURIComponent(news.slug || news.id)}`;
}

function classifyStatus(result: ClassifyResult): {
  status: PressCandidateStatus;
  programType: PressCandidateProgramType;
  skipReason: string | null;
} {
  if (!result.is_policy) {
    return {
      status: "skipped",
      programType: "not_policy",
      skipReason: "not_policy",
    };
  }
  if (result.program_type === "welfare" || result.program_type === "loan") {
    return {
      status: "pending",
      programType: result.program_type,
      skipReason: null,
    };
  }
  return {
    status: "skipped",
    programType: "unsure",
    skipReason: "program_type_unsure",
  };
}

export function buildCandidateUpsert({
  newsId,
  result,
}: {
  newsId: string;
  result: ClassifyResult;
}): PressCandidateUpsert {
  const { status, programType, skipReason } = classifyStatus(result);
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
  };
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

export function buildWelfareInsertPayload(candidate: PressCandidateForConfirm) {
  requirePending(candidate, "welfare");
  const result = candidate.classified_payload;
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
    source_code: SOURCE_CODE,
    source_id: candidate.news_id,
    ...extractTags(result),
  };
}

export function buildLoanInsertPayload(candidate: PressCandidateForConfirm) {
  requirePending(candidate, "loan");
  const result = candidate.classified_payload;
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
    source_code: SOURCE_CODE,
    source_id: candidate.news_id,
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
): Promise<PressCandidateListRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("press_ingest_candidates")
    .select(
      "id, news_id, status, program_type, title, category, classified_payload, skip_reason, error_message, classified_at, created_at, updated_at, news_posts!inner(id, ministry, slug)",
    )
    .eq("status", "pending")
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
  actorId: string,
): Promise<{ table: "welfare_programs" | "loan_programs"; id: string }> {
  const candidate = await getPressCandidateForConfirm(candidateId);
  if (!candidate) throw new Error("후보를 찾을 수 없습니다.");
  const admin = createAdminClient();
  const table =
    candidate.program_type === "welfare" ? "welfare_programs" : "loan_programs";
  const payload =
    candidate.program_type === "welfare"
      ? buildWelfareInsertPayload(candidate)
      : buildLoanInsertPayload(candidate);
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

export async function rejectPressCandidate(
  candidateId: string,
  actorId: string,
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
