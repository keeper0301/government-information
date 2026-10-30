import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { WELFARE_EXCLUDED_FILTER, LOAN_EXCLUDED_FILTER } from "@/lib/listing-sources";
import { isPolicySearchPublic, isBlogSearchPublic, type SearchBlog } from "@/lib/search-publication";
import type { EvidenceProgram } from "@/lib/policy/evidence-guide";
import reviews from "@/lib/blog-search-reviews.json";

// 광고 심사 중에도 검수 통과한 상세 글은 검색 제출 목록에 포함합니다.
export async function loadReviewedSearchPages(baseUrl: string): Promise<MetadataRoute.Sitemap> {
  const client = await createClient();
  const pages: MetadataRoute.Sitemap = [];
  for (const [kind, excluded] of [["welfare", WELFARE_EXCLUDED_FILTER], ["loan", LOAN_EXCLUDED_FILTER]]) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client.from(`${kind}_programs`).select("*")
        .eq("policy_guidance->>status", "approved").not("source_code", "in", excluded)
        .not("is_hidden", "is", true).is("duplicate_of_id", null)
        .order("id", { ascending: true }).range(offset, offset + 999);
      // 일시 장애를 빈 사이트맵으로 저장하지 않습니다.
      if (error) throw new Error("검수된 정책의 검색 제출 목록을 읽지 못했습니다.");
      for (const row of data ?? []) {
        if (isPolicySearchPublic(row as EvidenceProgram)) pages.push({
          url: `${baseUrl}/${kind}/${row.id}`, changeFrequency: "weekly", priority: 0.8,
        });
      }
      if (!data || data.length < 1000) break;
    }
  }
  const slugs = Object.keys(reviews);
  for (let offset = 0; offset < slugs.length; offset += 100) {
    const { data, error } = await client.from("blog_posts")
      .select("slug, title, content, meta_description, faqs, published_at")
      .in("slug", slugs.slice(offset, offset + 100)).not("published_at", "is", null);
    if (error) throw new Error("검수된 블로그의 검색 제출 목록을 읽지 못했습니다.");
    for (const post of (data ?? []) as SearchBlog[]) {
      if (isBlogSearchPublic(post)) pages.push({
        url: `${baseUrl}/blog/${encodeURIComponent(post.slug)}`, changeFrequency: "weekly", priority: 0.8,
      });
    }
  }
  return pages;
}
