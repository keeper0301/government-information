// ============================================================
// 홈 인기 정책 TOP 5 — server fetch + dismiss 가능한 사이드 배너
// ============================================================
// view_count 기반 인기 정책 5건. viewport 1800px+ fixed sticky sidebar
// (page.tsx 의 outer wrapper) 안에서 노출.
//
// 구조:
//   - HomePopularPicks (server, async): DB fetch + null 체크
//   - PopularPicksAside (client): JSX + dismiss + GA4 트래킹
//
// 사용자 피로도 방지:
//   - 닫기 X 버튼 (24시간 스누즈, localStorage)
//   - 24h 후 자동 복귀 — 가입 funnel 보존
// ============================================================

import { createClient } from "@/lib/supabase/server";
import {
  WELFARE_EXCLUDED_FILTER,
  LOAN_EXCLUDED_FILTER,
} from "@/lib/listing-sources";
import { PopularPicksAside, type PopularPick } from "./popular-picks-aside";

const LIMIT = 5;

async function getPopularPicks(): Promise<PopularPick[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // welfare/loan 각각 LIMIT 만큼 가져와 합쳐서 view_count desc 재정렬
  const [welfareRes, loanRes] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("id, title, view_count, apply_end")
      .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
      .or(`apply_end.gte.${today},apply_end.is.null`)
      .gt("view_count", 0)
      .order("view_count", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("loan_programs")
      .select("id, title, view_count, apply_end")
      .not("source_code", "in", LOAN_EXCLUDED_FILTER)
      .or(`apply_end.gte.${today},apply_end.is.null`)
      .gt("view_count", 0)
      .order("view_count", { ascending: false })
      .limit(LIMIT),
  ]);

  const merged: PopularPick[] = [
    ...(welfareRes.data ?? []).map((w) => ({ ...w, kind: "welfare" as const })),
    ...(loanRes.data ?? []).map((l) => ({ ...l, kind: "loan" as const })),
  ];

  return merged
    .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
    .slice(0, LIMIT);
}

export async function HomePopularPicks({ isLoggedIn }: { isLoggedIn: boolean }) {
  const picks = await getPopularPicks();
  if (picks.length === 0) return null;
  return <PopularPicksAside picks={picks} isLoggedIn={isLoggedIn} />;
}
