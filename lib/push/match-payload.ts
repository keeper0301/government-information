// ============================================================
// PWA 푸시 매칭 payload 빌더 (Spec 3 follow-up — payload 개인화)
// ============================================================
// user_alert_rules × 24h 신규 정책 매칭 → 개인화 push payload.
// findMatchingPrograms (alert-dispatch 와 동일 엔진) 재사용.
//
// 매칭 0건 → null (cron 이 발송 skip).
// 매칭 ≥1건 → 가장 최신 published_at 정책 1건 발송.
//
// 호출처: app/api/cron/push-send/route.ts (매시 가동, 1-user-1-device dedup 후)
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findMatchingPrograms,
  type AlertRule,
  type MatchedProgram,
} from "@/lib/alerts/matching";
import { isProgramAllowedForUser } from "@/lib/personalization/score";
import { createUserSignalsLoader } from "@/lib/personalization/user-signals";
import type { PushPayload } from "./send";

const MAX_TITLE_LEN = 80;
const MATCH_LIMIT_PER_RULE = 5;

function truncateTitle(title: string): string {
  if (title.length <= MAX_TITLE_LEN) return title;
  return title.slice(0, MAX_TITLE_LEN - 3) + "...";
}

// MatchedProgram → published_at DESC 정렬 (NULL 은 뒤로)
function comparePrograms(a: MatchedProgram, b: MatchedProgram): number {
  const aDate = a.published_at ?? "";
  const bDate = b.published_at ?? "";
  if (aDate === bDate) return 0;
  // NULL/빈 문자열은 항상 뒤로
  if (!aDate) return 1;
  if (!bDate) return -1;
  return bDate.localeCompare(aDate);
}

// MatchedProgram → PushPayload 변환
function programToPayload(top: MatchedProgram): PushPayload {
  const kind = top.table === "welfare_programs" ? "복지" : "대출";
  const path = top.table === "welfare_programs" ? "welfare" : "loan";
  return {
    title: `🎁 새 ${kind} 정책 매칭`,
    body: truncateTitle(top.title),
    url: `/${path}/${top.id}`,
    tag: `keepioo-${path}-${top.id}`,
  };
}

// 모든 active rule 의 매칭 합치고 (dedup + cohort gate) + 최신순 top 1 → payload.
// 매칭 0건 또는 모두 cohort gate 차단 시 null.
//
// cohort gate (2026-05-27 review subagent P1 fix):
//   alert-dispatch 와 동일한 isProgramAllowedForUser 필터링.
//   "자녀 없음" 사용자에게 산후조리 정책 발송 차단 (4/28 사고 회귀 방지).
export async function buildPushPayloadForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<PushPayload | null> {
  const { data: rules, error } = await supabase
    .from("user_alert_rules")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error || !rules || rules.length === 0) return null;

  // cohort gate 용 signals — 한 user 1회만 fetch (closure cache)
  const { getBusinessProfile, getUserSignals } = createUserSignalsLoader(supabase);
  const businessProfile = await getBusinessProfile(userId);
  const signals = await getUserSignals(userId, businessProfile);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const matched = new Map<string, MatchedProgram>();
  for (const rule of rules as AlertRule[]) {
    const programs = await findMatchingPrograms(
      supabase,
      rule,
      since,
      MATCH_LIMIT_PER_RULE,
    );
    for (const p of programs) {
      // cohort gate — 자녀 없음 + 산후조리 등 mismatch 차단
      if (
        !isProgramAllowedForUser(
          {
            id: p.id,
            title: p.title,
            description: p.description,
            source: p.source,
            household_target_tags: p.household_target_tags,
          },
          signals,
        )
      ) {
        continue;
      }
      // dedup key: table:id (welfare/loan 분리)
      matched.set(`${p.table}:${p.id}`, p);
    }
  }
  if (matched.size === 0) return null;

  const sorted = [...matched.values()].sort(comparePrograms);
  return programToPayload(sorted[0]);
}

// 테스트 전용 — pure 함수 export.
export const _internals = {
  truncateTitle,
  comparePrograms,
  programToPayload,
};
