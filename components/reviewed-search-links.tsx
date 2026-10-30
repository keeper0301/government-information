import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isBlogSearchPublic, type SearchBlog } from "@/lib/search-publication";
import reviews from "@/lib/blog-search-reviews.json";

export async function ReviewedSearchLinks() {
  const slugs = Object.keys(reviews);
  if (!slugs.length) return null;
  const client = await createClient();
  const { data, error } = await client.from("blog_posts")
    .select("slug, title, content, meta_description, faqs, published_at")
    .in("slug", slugs).not("published_at", "is", null);
  if (error) throw new Error("검수된 정책 안내를 읽지 못했습니다.");
  const posts = ((data ?? []) as SearchBlog[]).filter(isBlogSearchPublic);
  if (!posts.length) return null;
  return <section className="mb-8 rounded-2xl border p-5">
    <h2 className="text-lg font-bold mb-3">원문을 확인한 지역 정책 안내</h2>
    <ul className="space-y-3">{posts.map(post => <li key={post.slug}>
      <Link href={`/blog/${encodeURIComponent(post.slug)}`} className="text-blue-700 underline">
        {post.title}
      </Link>
    </li>)}</ul>
  </section>;
}
