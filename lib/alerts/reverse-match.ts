// ============================================================
// 알림 매칭 — 역방향 (정책 → 매칭되는 active rule)
// ============================================================
// matching.ts 의 findMatchingPrograms 가 rule → programs 방향이라면, 본 모듈은
// 그 반대. /admin/alert-simulator 가 사용 — "이 정책이 등록되면 누가 받을까?"
// 미리 가시화. 발송 안 함.
//
// 의미론: matching.ts 의 query.overlaps 와 동일 — rule 차원이 비어있으면 "전체
// 허용", 비어있지 않으면 정책 차원과 overlap 필요. 운영 트래픽 (active rule
// 수십~수백) 에서는 메모리 후처리가 SQL or() 조립보다 안전·정확.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlertRule } from "./matching";

// 매칭 입력 — welfare/loan_programs 의 매칭 관련 컬럼 발췌
export type ProgramTagsForMatch = {
  region_tags: string[];
  age_tags: string[];
  occupation_tags: string[];
  benefit_tags: string[];
  // 054 마이그레이션 — cohort gate 용. null = 정책 제한 없음.
  household_target_tags: string[] | null;
  // Phase 1.5 — null 이면 정책 income 미분류
  income_target_level: "low" | "mid_low" | "mid" | "any" | null;
  title: string;
  description: string | null;
};

// 매칭된 rule + 어느 차원이 매치 결정에 기여했는지
export type RuleMatch = {
  rule: AlertRule;
  // 매치된 차원 라벨 (region/age/occupation/benefit/household/income/keyword)
  // rule 빈 차원은 "전체 허용" 으로 통과만 하고 reasons 에는 안 들어감.
  reasons: string[];
};

// 두 배열이 한 원소라도 공유하면 true. 둘 중 하나라도 비어있으면 false.
// (PostgreSQL && 연산자와 동일 의미)
function arrayOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  return b.some((v) => set.has(v));
}

// 한 rule 이 정책에 매치되는지. rule 차원이 비어있으면 그 차원은 "전체 허용".
function matchProgramAgainstRule(
  program: ProgramTagsForMatch,
  rule: AlertRule,
): { matched: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (rule.region_tags.length > 0) {
    if (!arrayOverlap(rule.region_tags, program.region_tags)) {
      return { matched: false, reasons: [] };
    }
    reasons.push("region");
  }
  if (rule.age_tags.length > 0) {
    if (!arrayOverlap(rule.age_tags, program.age_tags)) {
      return { matched: false, reasons: [] };
    }
    reasons.push("age");
  }
  if (rule.occupation_tags.length > 0) {
    if (!arrayOverlap(rule.occupation_tags, program.occupation_tags)) {
      return { matched: false, reasons: [] };
    }
    reasons.push("occupation");
  }
  if (rule.benefit_tags.length > 0) {
    if (!arrayOverlap(rule.benefit_tags, program.benefit_tags)) {
      return { matched: false, reasons: [] };
    }
    reasons.push("benefit");
  }
  // household — rule 쪽 컬럼 (household_tags) 와 정책 쪽 (household_target_tags)
  // 가 둘 다 의미 있을 때만 비교. 정책 쪽 null 또는 [] 이면 "정책 제한 없음" →
  // 통과. (alert-dispatch.ts 의 isProgramAllowedForUser cohort gate 의미론 보존)
  if (
    rule.household_tags.length > 0 &&
    program.household_target_tags &&
    program.household_target_tags.length > 0
  ) {
    if (!arrayOverlap(rule.household_tags, program.household_target_tags)) {
      return { matched: false, reasons: [] };
    }
    reasons.push("household");
  }
  // income — 양쪽 모두 set 이면 정확 매칭. 한쪽이라도 null 이면 통과.
  // (matching.ts 는 rule.income_target 만 있으면 query.eq 적용 — 그러나
  // reverse 측에선 정책 income 이 null 이면 사용자 income rule 과 무관하게
  // 통과시키는 게 자연스러움. 정책이 income 을 제한하지 않으니까.)
  if (rule.income_target && program.income_target_level) {
    if (rule.income_target !== program.income_target_level) {
      return { matched: false, reasons: [] };
    }
    reasons.push("income");
  }
  // keyword — rule.keyword 가 있으면 정책 title/description 에 포함돼야
  if (rule.keyword && rule.keyword.trim().length >= 2) {
    const k = rule.keyword.trim().toLowerCase();
    const title = (program.title ?? "").toLowerCase();
    const desc = (program.description ?? "").toLowerCase();
    if (!title.includes(k) && !desc.includes(k)) {
      return { matched: false, reasons: [] };
    }
    reasons.push("keyword");
  }

  return { matched: true, reasons };
}

// ============================================================
// 정책 1건 → 매칭되는 active rule 전체
// ============================================================
// 운영: /admin/alert-simulator 가 사용. 서비스 키 (admin client) 권장 — 모든
// 사용자 rule 을 봐야 하므로 RLS 우회 필요.
// ============================================================
export async function findMatchingRulesForProgram(
  supabase: SupabaseClient,
  program: ProgramTagsForMatch,
): Promise<RuleMatch[]> {
  const { data, error } = await supabase
    .from("user_alert_rules")
    .select(
      "id, user_id, name, region_tags, age_tags, occupation_tags, benefit_tags, household_tags, income_target, keyword, channels, phone_number, is_active",
    )
    .eq("is_active", true);

  if (error) {
    console.error("[alerts:reverse-match] 규칙 조회 실패:", error);
    return [];
  }

  const matches: RuleMatch[] = [];
  for (const rule of (data ?? []) as AlertRule[]) {
    const result = matchProgramAgainstRule(program, rule);
    if (result.matched) {
      matches.push({ rule, reasons: result.reasons });
    }
  }
  return matches;
}
