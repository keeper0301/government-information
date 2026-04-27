/**
 * keepioo.com 가이드 페이지용 — supabase policy_guides read.
 *
 * 마케팅 시스템(keepio_agent) 이 정책 바이블 발행 시 INSERT 한 row 를 읽음.
 * RLS 의 "anon read all" 정책 덕분에 anon 키로 조회 가능.
 *
 * SSR Server Component (서버 환경) 에서만 호출. 클라이언트 호출 X.
 */

import { createClient } from "@/lib/supabase/server";

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

/** 발행 순으로 가이드 목록. 첫 시도엔 페이지네이션 X (가이드 50+개 시 추가). */
export async function getGuides(limit = 50): Promise<PolicyGuide[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("policy_guides")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[policy-guides] getGuides 실패:", error);
    return [];
  }
  return (data ?? []).map(rowToGuide);
}

/** slug 로 가이드 1개. 없으면 null. */
export async function getGuideBySlug(slug: string): Promise<PolicyGuide | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("policy_guides")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error(`[policy-guides] getGuideBySlug(${slug}) 실패:`, error);
    return null;
  }
  return data ? rowToGuide(data) : null;
}

/** 현재 가이드 외에 최신 발행 N개 (related). */
export async function getRelatedGuides(
  currentId: string,
  limit = 3
): Promise<PolicyGuide[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("policy_guides")
    .select("*")
    .neq("id", currentId)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[policy-guides] getRelatedGuides 실패:", error);
    return [];
  }
  return (data ?? []).map(rowToGuide);
}
