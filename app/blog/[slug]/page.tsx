import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArticleSchema } from "@/components/json-ld";
import { AdSlot } from "@/components/ad-slot";

export const revalidate = 3600;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("blog_posts").select("title, meta_description, tags").eq("slug", slug).single();
  if (!data) return { title: "블로그 — 정책알리미" };
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://jungcheck.kr";
  return {
    title: `${data.title} — 정책알리미`,
    description: data.meta_description || undefined,
    keywords: data.tags || undefined,
    openGraph: {
      title: data.title,
      description: data.meta_description || undefined,
      type: "article",
      url: `${baseUrl}/blog/${slug}`,
    },
  };
}

// Simple markdown-like rendering (handles #, ##, ###, -, \n)
function renderContent(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-[17px] font-bold text-grey-900 mt-6 mb-2">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-[20px] font-bold text-grey-900 mt-8 mb-3 tracking-[-0.5px]">{line.slice(3)}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-[24px] font-bold text-grey-900 mt-8 mb-3 tracking-[-0.8px]">{line.slice(2)}</h1>);
    } else if (line.startsWith("- ")) {
      elements.push(
        <div key={i} className="flex gap-2 ml-1 mb-1.5">
          <span className="text-grey-400 shrink-0">•</span>
          <span className="text-[15px] text-grey-700 leading-[1.7]">{line.slice(2)}</span>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-3" />);
    } else {
      elements.push(<p key={i} className="text-[15px] text-grey-700 leading-[1.7] mb-2">{line}</p>);
    }
  }
  return elements;
}

export default async function BlogDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!post) notFound();

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://jungcheck.kr";

  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-10 max-md:px-6">
      <ArticleSchema
        title={post.title}
        description={post.meta_description || ""}
        url={`${baseUrl}/blog/${post.slug}`}
        datePublished={post.published_at || post.created_at}
        tags={post.tags || undefined}
      />

      <a href="/blog" className="text-sm text-grey-500 no-underline hover:text-blue-500 transition-colors mb-6 inline-block">
        ← 블로그 목록
      </a>

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <div className="flex gap-2 mb-3">
          {post.tags.map((tag: string) => (
            <span key={tag} className="text-[12px] font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Title */}
      <h1 className="text-[32px] font-bold tracking-[-1.2px] text-grey-900 mb-3 max-md:text-[24px]">
        {post.title}
      </h1>

      {/* Date */}
      {post.published_at && (
        <div className="text-[14px] text-grey-500 mb-8">
          {new Date(post.published_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
        </div>
      )}

      {/* Content */}
      <article className="max-w-[700px]">
        {renderContent(post.content)}
      </article>

      {/* Ad */}
      <div className="mt-10">
        <AdSlot />
      </div>
    </main>
  );
}
