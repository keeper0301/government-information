// app/admin/recommendation-trace/trace-area.ts
// ============================================================
// 4 영역 (welfare/loan/news/blog) pool fetch + 각 정책 traceScore 실행
// ============================================================
// 기존 페이지 (/welfare, /loan, /news, /blog) 의 pool query 와 동일 SQL —
// 일관성 유지. score.ts 내부 호출도 동일 → 각 페이지 점수와 일치.
// ============================================================

import { createClient } from "@/lib/supabase/server";
import {
  traceScore,
  summarizeTrace,
  type ScoreTrace,
  type TraceSummary,
} from "@/lib/personalization/diagnostic";
import type { UserSignals } from "@/lib/personalization/types";
import type { ScorableItem } from "@/lib/personalization/score";
import {
  newsRowToScorable,
  blogRowToScorable,
} from "@/lib/personalization/home-recent";
import {
  WELFARE_EXCLUDED_FILTER,
  LOAN_EXCLUDED_FILTER,
} from "@/lib/listing-sources";

export type AreaName = "welfare" | "loan" | "news" | "blog";

export type AreaResult = {
  area: AreaName;
  traces: ScoreTrace[];
  summary: TraceSummary;
  error?: string;
};

const POOL_LIMIT = 100;
const MIN_SCORES: Record<AreaName, number> = {
  welfare: 8,
  loan: 8,
  news: 8,
  blog: 3,
};

export async function traceWelfare(user: UserSignals): Promise<AreaResult> {
  try {
    const supabase = await createClient();
    const today = new Date().toISOString().split("T")[0];
    // production app/welfare/page.tsx 의 pool query 와 동일한 필터·정렬 적용
    // (마감 필터 + duplicate_of_id 제외 + source_code 제외) — 진단 결과가
    // 실제 노출 pool 과 일치해야 의미 있음. 단 region 필터는 무시
    // (regional_gate 검증이 진단 핵심이므로 raw pool 측정).
    const { data, error } = await supabase
      .from("welfare_programs")
      .select(
        "id, title, target, description, eligibility, region, benefit_tags, apply_end, source, income_target_level, household_target_tags",
      )
      .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
      .is("duplicate_of_id", null)
      .or(`apply_end.gte.${today},apply_end.is.null`)
      .order("apply_end", { ascending: true, nullsFirst: false })
      .limit(POOL_LIMIT);
    if (error) throw error;
    const pool = (data ?? []) as ScorableItem[];
    const traces = pool.map((p) => traceScore(p, user, MIN_SCORES.welfare));
    return { area: "welfare", traces, summary: summarizeTrace(traces) };
  } catch (e) {
    return {
      area: "welfare",
      traces: [],
      summary: emptySummary(),
      error: (e as Error).message,
    };
  }
}

export async function traceLoan(user: UserSignals): Promise<AreaResult> {
  try {
    const supabase = await createClient();
    const today = new Date().toISOString().split("T")[0];
    // production app/loan/page.tsx 의 pool query 와 동일한 필터·정렬 적용
    const { data, error } = await supabase
      .from("loan_programs")
      .select(
        "id, title, target, description, eligibility, region_tags, benefit_tags, apply_end, source, income_target_level, household_target_tags",
      )
      .not("source_code", "in", LOAN_EXCLUDED_FILTER)
      .is("duplicate_of_id", null)
      .or(`apply_end.gte.${today},apply_end.is.null`)
      .order("apply_end", { ascending: true, nullsFirst: false })
      .limit(POOL_LIMIT);
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      id: string;
      title: string;
      target: string | null;
      description: string | null;
      eligibility: string | null;
      region_tags: string[] | null;
      benefit_tags: string[] | null;
      apply_end: string | null;
      source: string | null;
      income_target_level: ScorableItem["income_target_level"];
      household_target_tags: string[] | null;
    }>;
    // loan 은 region 컬럼 없음 → region_tags 첫 항목을 region 으로 (단순화)
    const pool: ScorableItem[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      target: r.target,
      description: r.description,
      eligibility: r.eligibility,
      region: r.region_tags?.[0] ?? null,
      district: null,
      benefit_tags: r.benefit_tags,
      apply_end: r.apply_end,
      source: r.source,
      income_target_level: r.income_target_level,
      household_target_tags: r.household_target_tags,
    }));
    const traces = pool.map((p) => traceScore(p, user, MIN_SCORES.loan));
    return { area: "loan", traces, summary: summarizeTrace(traces) };
  } catch (e) {
    return {
      area: "loan",
      traces: [],
      summary: emptySummary(),
      error: (e as Error).message,
    };
  }
}

export async function traceNews(user: UserSignals): Promise<AreaResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("news_posts_deduped" as "news_posts")
      .select(
        "id, slug, title, summary, body, ministry, benefit_tags, published_at",
      )
      .order("published_at", { ascending: false })
      .limit(POOL_LIMIT);
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      id: string;
      title: string;
      summary: string | null;
      body: string | null;
      ministry: string | null;
      benefit_tags: string[] | null;
    }>;
    const pool: ScorableItem[] = rows.map((r) => newsRowToScorable(r));
    const traces = pool.map((p) => traceScore(p, user, MIN_SCORES.news));
    return { area: "news", traces, summary: summarizeTrace(traces) };
  } catch (e) {
    return {
      area: "news",
      traces: [],
      summary: emptySummary(),
      error: (e as Error).message,
    };
  }
}

export async function traceBlog(user: UserSignals): Promise<AreaResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("blog_posts")
      .select("slug, title, meta_description, category, tags, published_at")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(POOL_LIMIT);
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      slug: string;
      title: string;
      meta_description: string | null;
      category: string | null;
      tags: string[] | null;
    }>;
    const pool: ScorableItem[] = rows.map((r) => blogRowToScorable(r));
    const traces = pool.map((p) => traceScore(p, user, MIN_SCORES.blog));
    return { area: "blog", traces, summary: summarizeTrace(traces) };
  } catch (e) {
    return {
      area: "blog",
      traces: [],
      summary: emptySummary(),
      error: (e as Error).message,
    };
  }
}

function emptySummary(): TraceSummary {
  return {
    total: 0,
    shown: 0,
    blocked: {
      shown: 0,
      below_min_score: 0,
      no_signal: 0,
      cohort_mismatch: 0,
      regional_gate: 0,
      household_gate: 0,
      business_mismatch: 0,
      income_gate: 0,
    },
    scoreDistribution: [
      { bucket: "0", count: 0 },
      { bucket: "1-3", count: 0 },
      { bucket: "4-7", count: 0 },
      { bucket: "8+", count: 0 },
    ],
  };
}
