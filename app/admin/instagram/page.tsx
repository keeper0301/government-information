// ============================================================
// /admin/instagram — 인스타그램 카드뉴스 자동 생성
// ============================================================
// keepioo 자동 발행 블로그 → 정사각형 1080×1080 카드 3장 자동 생성.
// 인스타 자체 게시는 Meta API 복잡도 + 사장님 비즈니스 계정 필요로 반자동.
//
// 사장님 흐름 (5분/글):
//   1) 어드민에서 정책 1편 선택
//   2) 카드 3장 미리보기 확인 (표지 / 핵심정보 / CTA)
//   3) 「캡션 복사」 클릭
//   4) 각 카드 우클릭 → "이미지 저장"
//   5) 인스타 앱에서 멀티이미지 게시 + 캡션 paste
//
// 인스타 게시 후 효과:
//   - 카드뉴스 백링크 (프로필 link in bio = keepioo.com) 효과
//   - 해시태그 검색 노출 (#청년정책 #소상공인지원 등)
//   - 카드 하단의 keepioo 브랜드 시각 노출
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { buildInstagramCaption, getLinkInBioText } from "@/lib/instagram/caption";
import { CopyCaption } from "./copy-caption";

export const metadata: Metadata = {
  title: "인스타 카드뉴스 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/instagram");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

type RecentPost = {
  id: string;
  slug: string;
  title: string;
  meta_description: string | null;
  category: string | null;
  tags: string[] | null;
  published_at: string;
};

async function loadRecentPosts(): Promise<RecentPost[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("blog_posts")
    .select("id, slug, title, meta_description, category, tags, published_at")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(20);
  return (data ?? []) as RecentPost[];
}

export default async function AdminInstagramPage() {
  await requireAdmin();
  const posts = await loadRecentPosts();

  return (
    <div className="max-w-[980px]">
      <AdminPageHeader
        kicker="ADMIN · 마케팅"
        title="인스타 카드뉴스"
        description="keepioo 블로그 글을 1080×1080 인스타 카드 3장으로 자동 변환 — 백링크·해시태그 노출"
      />

      {/* 사용 가이드 */}
      <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-4 text-xs text-blue-900 leading-[1.7]">
        💡 <strong>사용법</strong>:
        <ol className="mt-2 list-decimal pl-5 space-y-1">
          <li>아래 정책 1편 선택 → 카드 3장 미리보기 확인 (표지·정보·CTA)</li>
          <li>각 카드 이미지 우클릭 → <strong>「이미지 저장」</strong> (3개 모두)</li>
          <li><strong>「캡션 복사」</strong> 버튼 클릭</li>
          <li>인스타 앱 → <strong>멀티이미지 게시</strong> (3장 함께 업로드) → 캡션 paste → 게시</li>
        </ol>
        <p className="mt-3">
          <strong>📌 사장님 인스타 프로필 link in bio 1회 설정</strong>:{" "}
          <code className="text-[11px] bg-white px-1 py-0.5 rounded">{getLinkInBioText()}</code>
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-grey-200 bg-grey-50 p-6 text-center text-sm text-grey-600">
          아직 발행된 블로그 글이 없어요.
        </div>
      ) : (
        <ul className="space-y-6">
          {posts.map((post) => {
            const caption = buildInstagramCaption({
              title: post.title,
              meta_description: post.meta_description,
              category: post.category,
              tags: post.tags,
              detailUrl: `https://www.keepioo.com/blog/${post.slug}`,
            });
            return (
              <li
                key={post.id}
                className="rounded-lg border border-grey-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-grey-900">
                      {post.title}
                    </h3>
                    <p className="text-xs text-grey-500 mt-1">
                      {post.category ?? "—"} · {formatDate(post.published_at)}
                    </p>
                  </div>
                  <CopyCaption caption={caption} />
                </div>

                {/* 카드 3장 미리보기 — 그리드 */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[1, 2, 3].map((idx) => (
                    <a
                      key={idx}
                      href={`/api/instagram-card/${encodeURIComponent(post.slug)}/${idx}`}
                      target="_blank"
                      rel="noopener"
                      className="block group"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/instagram-card/${encodeURIComponent(post.slug)}/${idx}`}
                        alt={`카드 ${idx}`}
                        className="w-full aspect-square rounded border border-grey-200 group-hover:border-blue-400 transition-colors"
                        loading="lazy"
                      />
                      <p className="text-[11px] text-grey-600 mt-1 text-center">
                        {idx === 1 ? "표지" : idx === 2 ? "핵심 정보" : "CTA"}
                      </p>
                    </a>
                  ))}
                </div>

                {/* 캡션 미리보기 (접힘) */}
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-grey-700 font-medium hover:text-grey-900">
                    캡션 미리보기
                  </summary>
                  <pre className="mt-2 p-3 bg-grey-50 rounded text-xs whitespace-pre-wrap font-sans text-grey-700">
                    {caption}
                  </pre>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
