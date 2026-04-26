// ============================================================
// 맞춤 알림 매칭 엔진
// ============================================================
// 사용자 규칙(태그 배열) 과 정책(태그 배열) 을 Postgres `&&` 연산(교집합)으로 매칭
// 차원별 배열이 비어있으면 그 차원은 "전체 허용" 으로 간주
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type AlertRule = {
  id: string;
  user_id: string;
  name: string;
  region_tags: string[];
  age_tags: string[];
  occupation_tags: string[];
  benefit_tags: string[];
  household_tags: string[];
  // Phase 1.5 income 매칭 (054 마이그레이션). null 이면 매칭 무관.
  income_target: 'low' | 'mid_low' | 'mid' | 'any' | null;
  keyword: string | null;
  channels: string[];
  phone_number: string | null;
  is_active: boolean;
};

export type MatchedProgram = {
  id: string;
  title: string;
  source: string;
  apply_url: string | null;
  apply_end: string | null;
  published_at: string | null;
  description: string | null;
  table: "welfare_programs" | "loan_programs";
};

// ============================================================
// 규칙 하나에 대해 매칭되는 새 정책 조회
// ============================================================
// since: 이 시각 이후 수집된 정책만 대상 (보통 24시간 전)
// limit: 한 번에 가져올 최대 건수 (과발송 방지)
// ============================================================
export async function findMatchingPrograms(
  supabase: SupabaseClient,
  rule: AlertRule,
  since: Date,
  limit = 20,
): Promise<MatchedProgram[]> {
  const sinceIso = since.toISOString();
  const results: MatchedProgram[] = [];

  for (const table of ["welfare_programs", "loan_programs"] as const) {
    let query = supabase
      .from(table)
      .select(
        "id, title, source, apply_url, apply_end, published_at, description",
      )
      .gte("fetched_at", sinceIso)
      // duplicate_of_id 가 있으면 중복이므로 건너뛰기
      .is("duplicate_of_id", null)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    // 배열 교집합 — 비어있으면 생략
    if (rule.region_tags.length > 0) {
      query = query.overlaps("region_tags", rule.region_tags);
    }
    if (rule.age_tags.length > 0) {
      query = query.overlaps("age_tags", rule.age_tags);
    }
    if (rule.occupation_tags.length > 0) {
      query = query.overlaps("occupation_tags", rule.occupation_tags);
    }
    if (rule.benefit_tags.length > 0) {
      query = query.overlaps("benefit_tags", rule.benefit_tags);
    }
    if (rule.household_tags.length > 0) {
      query = query.overlaps("household_tags", rule.household_tags);
    }
    // Phase 1.5 income 매칭 — rule.income_target 설정된 경우만 정책의
    // income_target_level 과 정확 매칭 (extractTargeting 추출 결과).
    if (rule.income_target) {
      query = query.eq("income_target_level", rule.income_target);
    }
    if (rule.keyword && rule.keyword.trim().length >= 2) {
      const k = rule.keyword.trim();
      query = query.or(`title.ilike.%${k}%,description.ilike.%${k}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`[alerts:matching] ${table} 쿼리 실패:`, error);
      continue;
    }

    for (const row of data || []) {
      results.push({ ...row, table } as MatchedProgram);
    }
  }

  // 최신 순 정렬 (published_at DESC, 없으면 뒤)
  results.sort((a, b) => {
    const pa = a.published_at || "";
    const pb = b.published_at || "";
    return pb.localeCompare(pa);
  });

  return results.slice(0, limit);
}

// ============================================================
// "미리보기" 용 — 알림 규칙 작성 중 현재 매칭 개수 반환
// ============================================================
export async function previewMatchCount(
  supabase: SupabaseClient,
  rule: Pick<AlertRule,
    "region_tags" | "age_tags" | "occupation_tags" | "benefit_tags" | "household_tags" | "income_target" | "keyword">,
): Promise<{ total: number; samples: MatchedProgram[] }> {
  const samples: MatchedProgram[] = [];
  let total = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const table of ["welfare_programs", "loan_programs"] as const) {
    let query = supabase
      .from(table)
      .select("id, title, source, apply_url, apply_end, published_at, description", { count: "exact" })
      .is("duplicate_of_id", null)
      // 활성 정책 (마감 안 지남 OR 상시)
      .or(`apply_end.is.null,apply_end.gte.${today}`)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(5);

    if (rule.region_tags.length > 0) query = query.overlaps("region_tags", rule.region_tags);
    if (rule.age_tags.length > 0) query = query.overlaps("age_tags", rule.age_tags);
    if (rule.occupation_tags.length > 0) query = query.overlaps("occupation_tags", rule.occupation_tags);
    if (rule.benefit_tags.length > 0) query = query.overlaps("benefit_tags", rule.benefit_tags);
    if (rule.household_tags.length > 0) query = query.overlaps("household_tags", rule.household_tags);
    if (rule.income_target) query = query.eq("income_target_level", rule.income_target);
    if (rule.keyword && rule.keyword.trim().length >= 2) {
      const k = rule.keyword.trim();
      query = query.or(`title.ilike.%${k}%,description.ilike.%${k}%`);
    }

    const { data, count } = await query;
    total += count || 0;
    for (const row of data || []) {
      samples.push({ ...row, table } as MatchedProgram);
    }
  }

  samples.sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""));

  return { total, samples: samples.slice(0, 5) };
}
