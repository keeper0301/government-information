import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "블로그 — 정책알리미",
  description: "복지·대출 관련 가이드와 최신 정보를 확인하세요.",
};

export const revalidate = 600;

export default async function BlogPage() {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("blog_posts")
    .select("slug, title, meta_description, tags, published_at")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });

  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-10 max-md:px-6">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">블로그</h1>
      <p className="text-[15px] text-grey-600 mb-10">복지·대출 관련 가이드와 최신 정보를 확인하세요.</p>

      <div className="flex flex-col gap-4">
        {(posts || []).map((post) => (
          <a
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="block p-6 bg-grey-50 rounded-2xl no-underline text-inherit hover:bg-grey-100 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              {post.tags?.slice(0, 3).map((tag: string) => (
                <span key={tag} className="text-[12px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                  {tag}
                </span>
              ))}
            </div>
            <h2 className="text-[18px] font-bold text-grey-900 tracking-[-0.5px] mb-2">{post.title}</h2>
            {post.meta_description && (
              <p className="text-[14px] text-grey-600 leading-[1.6] line-clamp-2">{post.meta_description}</p>
            )}
            {post.published_at && (
              <div className="mt-3 text-[12px] text-grey-500">
                {new Date(post.published_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
              </div>
            )}
          </a>
        ))}
        {(!posts || posts.length === 0) && (
          <div className="py-20 text-center text-grey-500">아직 작성된 글이 없습니다.</div>
        )}
      </div>
    </main>
  );
}
