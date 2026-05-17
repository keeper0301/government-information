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
import { type ScorableItem } from "@/lib/personalization/score";
import { REGION_ALIASES } from "@/lib/personalization/region-match";
import { PERSONAL_SECTION_MIN_SCORE } from "@/lib/personalization/types";
import {
  newsRowToScorable,
  blogRowToScorable,
} from "@/lib/personalization/home-recent";
import {
  WELFARE_EXCLUDED_FILTER,
  LOAN_EXCLUDED_FILTER,
} from "@/lib/listing-sources";
import { PROVINCES } from "@/lib/regions";

// news ministry 가 광역 정식명일 때만 region 으로 식별 — app/news/page.tsx 와 동일
const PROVINCE_FULL_NAMES_LIST = PROVINCES.map((p) => p.name);

export type AreaName = "welfare" | "loan" | "news" | "blog";

export type AreaResult = {
  area: AreaName;
  traces: ScoreTrace[];
  summary: TraceSummary;
  error?: string;
};

const POOL_LIMIT = 100;
// production 페이지의 minScore 와 동일 유지 (welfare/loan/news 통일, blog 별도)
const MIN_SCORES: Record<AreaName, number> = {
  welfare: PERSONAL_SECTION_MIN_SCORE,
  loan: PERSONAL_SECTION_MIN_SCORE,
  news: PERSONAL_SECTION_MIN_SCORE,
  blog: 3,
};

export async function traceWelfare(user: UserSignals): Promise<AreaResult> {
  try {
    const supabase = await createClient();
    const today = new Date().toISOString().split("T")[0];
    // production app/welfare/page.tsx 의 pool query 와 동일한 필터·정렬 적용
    // 사용자 광역 우선 pool — 사용자 region 있으면 사용자 광역+전국 ilike OR
    // (production 사용자 경험과 정합. 진단 결과가 실제 노출률 반영.)
    let q = supabase
      .from("welfare_programs")
      .select(
        "id, title, target, description, eligibility, region, district, benefit_tags, apply_end, source, income_target_level, household_target_tags",
      )
      .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
      .is("duplicate_of_id", null);
    if (user.region) {
      const aliases = REGION_ALIASES[user.region] ?? [user.region];
      const regionOr = [
        "region.ilike.%전국%",
        ...aliases.map((a) => `region.ilike.%${a}%`),
      ].join(",");
      q = q.or(regionOr);
    }
    const { data, error } = await q
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
    // 사용자 광역 우선: region_tags 또는 title prefix 매칭
    let q = supabase
      .from("loan_programs")
      .select(
        "id, title, target, description, eligibility, region_tags, district, region, benefit_tags, apply_end, source, income_target_level, household_target_tags",
      )
      .not("source_code", "in", LOAN_EXCLUDED_FILTER)
      .is("duplicate_of_id", null);
    if (user.region) {
      const aliases = REGION_ALIASES[user.region] ?? [user.region];
      const orParts: string[] = ["region_tags.cs.{전국}"];
      for (const a of aliases) {
        orParts.push(`region_tags.cs.{${a}}`);
        orParts.push(`title.ilike.%[${a}%`);
        orParts.push(`title.ilike.%(${a}%`);
      }
      q = q.or(orParts.join(","));
    }
    const { data, error } = await q
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
      region: string | null;
      district: string | null;
      benefit_tags: string[] | null;
      apply_end: string | null;
      source: string | null;
      income_target_level: ScorableItem["income_target_level"];
      household_target_tags: string[] | null;
    }>;
    // loan: region 컬럼 신설 (migration 090) — 비어있으면 region_tags 첫 항목 fallback.
    // district 컬럼도 신설 — Phase A 백필 적용분 (extractor 자동 추출).
    const pool: ScorableItem[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      target: r.target,
      description: r.description,
      eligibility: r.eligibility,
      region: r.region ?? r.region_tags?.[0] ?? null,
      district: r.district ?? null,
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
    // production app/news/page.tsx 의 pool query 와 동일한 필터 적용
    // 사용자 광역 우선: ministry IS NULL OR ministry NOT IN (다른 광역)
    let q = supabase
      .from("news_posts_deduped" as "news_posts")
      .select(
        "id, slug, title, summary, body, ministry, benefit_tags, published_at",
      )
      .neq("category", "press")
      .not("keywords", "eq", "{}");
    if (user.region) {
      const userAliases = REGION_ALIASES[user.region] ?? [user.region];
      const otherProvinces = PROVINCE_FULL_NAMES_LIST.filter(
        (p) => !userAliases.includes(p),
      );
      const orFilter = [
        "ministry.is.null",
        `ministry.not.in.(${otherProvinces.join(",")})`,
      ].join(",");
      q = q.or(orFilter);
    }
    const { data, error } = await q
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
    cohortBreakdown: [],
  };
}
