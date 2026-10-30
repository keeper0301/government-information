import { createHash } from "node:crypto";
import { getPublishedGuide, type EvidenceProgram } from "@/lib/policy/evidence-guide";
import reviews from "@/lib/blog-search-reviews.json";

// 광고 승인과 별개로 검색 공개는 글별 검수 결과로 결정합니다.
export function isPolicySearchPublic(row: EvidenceProgram): boolean {
  return row.is_hidden !== true && !row.duplicate_of_id && !!getPublishedGuide(row);
}

export type SearchBlog = {
  slug: string; title: string; content: string; meta_description: string | null;
  faqs: unknown; published_at: string | null;
};

// 본문·제목·검색 설명·질문답변 중 하나라도 바뀌면 재검수가 필요합니다.
export function blogSearchSnapshot(post: SearchBlog): string {
  return createHash("sha256").update(JSON.stringify([
    post.slug, post.title, post.content, post.meta_description,
    Array.isArray(post.faqs) ? post.faqs.map(item => [item.question, item.answer]) : null,
  ])).digest("hex");
}

export function isBlogSearchPublic(post: SearchBlog): boolean {
  const review = (reviews as Record<string, { snapshot: string; checkedAt: string }>)[post.slug];
  return !!post.published_at && !!review && Number.isFinite(Date.parse(review.checkedAt))
    && Date.parse(review.checkedAt) <= Date.now() && review.snapshot === blogSearchSnapshot(post);
}
