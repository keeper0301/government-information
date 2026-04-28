// ============================================================
// 인기 정책 TOP N — view_count 기반 fetch
// ============================================================
// 홈 우측 sticky sidebar (1800px+) 와 AlertStrip 다음 일반 섹션 양쪽
// 에서 사용. react cache 로 같은 요청 안 1회만 fetch.
//
// 같은 정책이 양쪽 노출 — sidebar 는 큰 모니터 사용자 fixed sticky,
// 일반 섹션은 모든 viewport 사용자 첫 화면 스크롤 직후. UX 분리 의도.
// ============================================================

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  WELFARE_EXCLUDED_FILTER,
  LOAN_EXCLUDED_FILTER,
} from "@/lib/listing-sources";

export type PopularPick = {
  id: string;
  title: string;
  view_count: number;
  apply_end: string | null;
  kind: "welfare" | "loan";
};

const DEFAULT_LIMIT = 5;

export const getPopularPicks = cache(
  async (limit: number = DEFAULT_LIMIT): Promise<PopularPick[]> => {
    const supabase = await createClient();
    const today = new Date().toISOString().split("T")[0];

    const [welfareRes, loanRes] = await Promise.all([
      supabase
        .from("welfare_programs")
        .select("id, title, view_count, apply_end")
        .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
        .or(`apply_end.gte.${today},apply_end.is.null`)
        .gt("view_count", 0)
        .order("view_count", { ascending: false })
        .limit(limit),
      supabase
        .from("loan_programs")
        .select("id, title, view_count, apply_end")
        .not("source_code", "in", LOAN_EXCLUDED_FILTER)
        .or(`apply_end.gte.${today},apply_end.is.null`)
        .gt("view_count", 0)
        .order("view_count", { ascending: false })
        .limit(limit),
    ]);

    const merged: PopularPick[] = [
      ...(welfareRes.data ?? []).map((w) => ({ ...w, kind: "welfare" as const })),
      ...(loanRes.data ?? []).map((l) => ({ ...l, kind: "loan" as const })),
    ];

    return merged
      .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
      .slice(0, limit);
  },
);
