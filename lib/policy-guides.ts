/**
 * keepioo.com 가이드 페이지용 — supabase policy_guides read.
 *
 * 마케팅 시스템(keepio_agent) 이 정책 바이블 발행 시 INSERT 한 row 를 읽음.
 * RLS 의 "anon read all" 정책 덕분에 anon 키로 조회 가능.
 *
 * SSR Server Component (서버 환경) 에서만 호출. 클라이언트 호출 X.
 */

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseAnonEnv } from "@/lib/supabase/env";
import { EDITORIAL_GUIDES } from "@/lib/editorial-guides";
import { getGuideEvidence, guideCategorySlugs } from "@/lib/guide-evidence";

export interface PolicyGuide {
  id: string;
  slug: string;
  title: string;
  programId: string;
  programType: "welfare" | "loan";
  /** 5글 — index 0 이 1편, 4 가 5편 */
  posts: string[];
  rotationIdx: number | null;
  threadsUrl: string | null;
  ogImageUrl: string | null;
  publishedAt: string;  // ISO 8601
  updatedAt: string;
}

interface PolicyGuideRow {
  id: string;
  slug: string;
  title: string;
  program_id: string;
  program_type: string;
  post_1: string;
  post_2: string;
  post_3: string;
  post_4: string;
  post_5: string;
  rotation_idx: number | null;
  threads_url: string | null;
  og_image_url: string | null;
  published_at: string;
  updated_at: string;
}

export function rowToGuide(row: PolicyGuideRow): PolicyGuide {
  const body = [row.post_1, row.post_2, row.post_3, row.post_4, row.post_5];
  if (typeof row.title !== "string" || !row.title.trim() ||
      body.some(post => typeof post !== "string" || !post.trim()) ||
      typeof row.slug !== "string" || !row.slug.trim()) {
    throw new Error("Invalid policy guide content");
  }
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    programId: row.program_id,
    programType: row.program_type as "welfare" | "loan",
    posts: [row.post_1, row.post_2, row.post_3, row.post_4, row.post_5],
    rotationIdx: row.rotation_idx,
    threadsUrl: row.threads_url,
    ogImageUrl: row.og_image_url,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

/** Reject normalized impossible dates, timezone-free timestamps, and future values. */
function validGuideDate(value: unknown, now: Date): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second, zone] = match;
  const calendar = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return undefined;
  if (hour && (+hour > 23 || +minute > 59 || +second > 59)) return undefined;
  if (zone && zone !== "Z" && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59)) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  if (!hour) return value <= now.toISOString().slice(0, 10) ? value : undefined;
  return date.getTime() <= now.getTime() ? date.toISOString() : undefined;
}

/** One date provenance policy for body, OG, JSON-LD and sitemap. */
export function getGuideDisplayDates(guide: PolicyGuide, now = new Date()): {
  publishedAt?: string; updatedAt?: string;
} {
  const evidence = getGuideEvidence(guide);
  return {
    publishedAt: validGuideDate(guide.publishedAt, now),
    updatedAt: validGuideDate(evidence ? evidence.actualUpdatedAt : guide.updatedAt, now),
  };
}

interface GuideOptions {
  categorySlugs?: readonly string[];
  excludeId?: string;
}

/** Merge DB-priority versions, filter and curate before applying the caller limit. */
export async function getGuides(limit = 50, options: GuideOptions = {}): Promise<PolicyGuide[]> {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Invalid guide limit");
  if (limit === 0) return [];
  const dbGuides: PolicyGuide[] = [];
  if (hasSupabaseAnonEnv()) {
    const supabase = await createClient();
    const pageSize = 200;
    const safetyCap = 60000;
    for (let from = 0; ;) {
      if (from >= safetyCap) throw new Error("Guide pagination safety cap reached; candidates incomplete");
      const { data, error } = await supabase.from("policy_guides").select("*")
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) {
        // Never return a partially collected list as a complete candidate set.
        throw new Error("Guide data temporarily unavailable", { cause: error });
      }
      if (!data || data.length === 0) break;
      dbGuides.push(...data.map(rowToGuide));
      // Advance by actual rows: PostgREST may enforce a smaller server max-rows.
      from += data.length;
    }
  }
  const merged = new Map<string, PolicyGuide>();
  for (const guide of [...dbGuides, ...EDITORIAL_GUIDES]) {
    if (!merged.has(guide.slug)) merged.set(guide.slug, guide);
  }
  return [...merged.values()]
    .filter(guide => guide.id !== options.excludeId && (!options.categorySlugs ||
      guideCategorySlugs(guide).some(category => options.categorySlugs!.includes(category))))
    .sort((a, b) => Number(!!getGuideEvidence(b)) - Number(!!getGuideEvidence(a)))
    .slice(0, limit);
}

/** slug 로 가이드 1개. 없으면 null. */
export async function getGuideBySlug(slug: string): Promise<PolicyGuide | null> {
  const builtin = EDITORIAL_GUIDES.find((g) => g.slug === slug) ?? null;
  if (!hasSupabaseAnonEnv()) return builtin;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("policy_guides")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error(`[policy-guides] getGuideBySlug(${slug}) 실패:`, error);
    if (builtin) return builtin;
    throw new Error("Guide data temporarily unavailable", { cause: error });
  }
  return data ? rowToGuide(data) : builtin;
}

/** Related candidates use the same version and curation policy. */
export async function getRelatedGuides(currentId: string, limit = 3): Promise<PolicyGuide[]> {
  return getGuides(limit, { excludeId: currentId });
}
