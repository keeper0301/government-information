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
  // migration 092 (2026-05-17) — 거주지 시·군 정확 매칭. NULL 이면 광역만 매칭.
  district: string | null;
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
  // cohort gate 적용용 — alert-dispatch 가 isProgramAllowedForUser 로 필터링.
  // null 일 경우 score.ts gate 가 미적용 (정책 제한 없음으로 해석).
  household_target_tags: string[] | null;
  // migration 092 — 거주지 정확 매칭 시그널 (district 매칭 +1)
  district: string | null;
  table: "welfare_programs" | "loan_programs";
};

// PostgREST .or() 필터에서 쉼표는 조건 구분자, 괄호는 그룹, % 는 ILIKE 와일드카드라
// 사용자 keyword 에 이 문자가 섞이면 필터 문법이 깨져 그 테이블 매칭이 통째로 실패
// → 해당 사용자 알림이 silent 누락된다(코드리뷰 P1). 알림 작성 입력창 placeholder 가
// "전기차, 창업자금" 처럼 쉼표를 유도해 실제로 흔히 발생. 보간 전에 메타문자를 제거한다.
function sanitizeAlertKeyword(raw: string): string {
  return raw.replace(/[,()%]/g, " ").replace(/\s+/g, " ").trim();
}

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
        "id, title, source, apply_url, apply_end, published_at, description, household_target_tags, district",
      )
      .gte("fetched_at", sinceIso)
      // duplicate_of_id 가 있으면 중복이므로 건너뛰기
      .is("duplicate_of_id", null)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    // migration 092 (2026-05-17) — 사용자 거주지 시·군 매칭 우선.
    // rule.district 설정 시 program.district 정확 매칭 row 만 + 광역 단위 (district NULL)
    // 도 같이 (전국·광역 정책 노출 유지). OR 조합.
    if (rule.district) {
      query = query.or(`district.eq.${rule.district},district.is.null`);
    }

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
      const k = sanitizeAlertKeyword(rule.keyword);
      if (k.length >= 2) {
        query = query.or(`title.ilike.%${k}%,description.ilike.%${k}%`);
      }
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
      const k = sanitizeAlertKeyword(rule.keyword);
      if (k.length >= 2) {
        query = query.or(`title.ilike.%${k}%,description.ilike.%${k}%`);
      }
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
