// ============================================================
// /admin/blog/[id] — 블로그 글 편집
// ============================================================
// 편집 가능한 필드:
//   · title (제목)
//   · meta_description (도입부 · 검색엔진 메타) — HTML 태그 자동 strip 저장
//   · category (청년/노년/주거/자영업 등)
//   · tags (쉼표 구분)
//   · cover_image (URL)
//   · content (본문 HTML) — raw HTML 수정 가능한 큰 textarea
//   · published_at 발행 토글 (발행·미발행 버튼)
//
// 저장 시:
//   · admin_actions 에 blog_edit / blog_publish / blog_unpublish 감사 로그
//   · /blog/[slug] 와 /blog ISR 재생성 (revalidatePath)
//   · meta_description 은 저장 시 stripHtmlTags → 태그 섞임 재발 방지
// ============================================================

import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-actions";
import { stripHtmlTags } from "@/lib/utils";
import { sanitizeBlogHtml } from "@/lib/html-sanitize";
import { RichEditor } from "./rich-editor";
// admin sub page 표준 헤더 — kicker · title · description 슬롯 통일
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const metadata: Metadata = {
  title: "블로그 글 편집 | 어드민",
  robots: { index: false, follow: false },
};

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/blog");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function AdminBlogEditPage({ params, searchParams }: Props) {
  await requireAdmin();
  const { id } = await params;
  const { saved, error: errorMsg } = await searchParams;

  const admin = createAdminClient();
  const { data: post, error } = await admin
    .from("blog_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !post) notFound();

  // ─── Server Action: 본문·메타 저장 ───
  async function saveBlogPost(formData: FormData) {
    "use server";
    const user = await requireAdmin();

    const title = (formData.get("title") as string | null)?.trim() || "";
    const metaRaw = (formData.get("meta_description") as string | null) || "";
    const category = (formData.get("category") as string | null)?.trim() || null;
    const tagsRaw = (formData.get("tags") as string | null) || "";
    const coverImage =
      (formData.get("cover_image") as string | null)?.trim() || null;
    const content = (formData.get("content") as string | null) || "";

    if (!title) {
      redirect(`/admin/blog/${id}?error=${encodeURIComponent("제목은 필수입니다")}`);
    }

    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const metaDescription = stripHtmlTags(metaRaw);
    // XSS 차단 — DB 저장 전 sanitize. <script>·on*·javascript: URL 등 제거.
    const safeContent = await sanitizeBlogHtml(content);

    const admin2 = createAdminClient();
    const { error: updateError } = await admin2
      .from("blog_posts")
      .update({
        title,
        meta_description: metaDescription || null,
        category,
        tags: tags.length > 0 ? tags : null,
        cover_image: coverImage,
        content: safeContent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      redirect(
        `/admin/blog/${id}?error=${encodeURIComponent(`저장 실패: ${updateError.message}`)}`,
      );
    }

    await logAdminAction({
      actorId: user.id,
      action: "blog_edit",
      details: {
        post_id: id,
        slug: post!.slug,
        title_after: title,
        fields: ["title", "meta_description", "category", "tags", "cover_image", "content"],
      },
    });

    // ISR 재생성 — 블로그 상세 + 목록
    revalidatePath(`/blog/${post!.slug}`);
    revalidatePath("/blog");

    redirect(`/admin/blog/${id}?saved=1`);
  }

  // ─── Server Action: 발행 토글 ───
  async function togglePublish() {
    "use server";
    const user = await requireAdmin();
    const admin2 = createAdminClient();
    const nowPublished = !!post!.published_at;

    const { error: updateError } = await admin2
      .from("blog_posts")
      .update({
        published_at: nowPublished ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      redirect(
        `/admin/blog/${id}?error=${encodeURIComponent(`상태 변경 실패: ${updateError.message}`)}`,
      );
    }

    await logAdminAction({
      actorId: user.id,
      action: nowPublished ? "blog_unpublish" : "blog_publish",
      details: { post_id: id, slug: post!.slug, title: post!.title },
    });

    revalidatePath(`/blog/${post!.slug}`);
    revalidatePath("/blog");

    redirect(`/admin/blog/${id}?saved=1`);
  }

  const tagsString = Array.isArray(post.tags) ? post.tags.join(", ") : "";
  const isPublished = !!post.published_at;

  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-10 max-md:px-6">
      {/* 표준 헤더 슬롯 — F4 마이그레이션 */}
      <AdminPageHeader
        kicker="ADMIN · 컨텐츠 발행"
        title="블로그 글 편집"
      />
      <div className="flex flex-wrap items-center gap-2 mb-6 text-sm text-grey-600">
        {/* breadcrumb — 사이드바 클릭 없이 즉시 목록 복귀 (상세→목록 이동 빈도 ↑) */}
        <Link
          href="/admin/blog"
          className="text-blue-600 hover:text-blue-700 no-underline"
        >
          ← 블로그 목록
        </Link>
        <span>·</span>
        <Link
          href={`/blog/${post.slug}`}
          target="_blank"
          className="text-blue-600 hover:text-blue-700 no-underline"
        >
          /blog/{post.slug} ↗
        </Link>
        <span>·</span>
        <span>
          수정 {new Date(post.updated_at).toLocaleString("ko-KR")}
        </span>
        {post.published_at && (
          <>
            <span>·</span>
            <span>발행 {new Date(post.published_at).toLocaleString("ko-KR")}</span>
          </>
        )}
      </div>

      {/* 성공/에러 배너 */}
      {saved && (
        <div className="mb-5 px-4 py-3 text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
          ✓ 저장되었습니다. 페이지 재생성도 요청했어요.
        </div>
      )}
      {errorMsg && (
        <div className="mb-5 px-4 py-3 text-sm font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg">
          ⚠ {errorMsg}
        </div>
      )}

      {/* 발행 상태 패널 */}
      <div className="mb-6 px-5 py-4 border border-grey-200 rounded-xl bg-white flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm text-grey-500 mb-1">현재 상태</div>
          <div className="flex items-center gap-2">
            {isPublished ? (
              <span className="inline-block px-2.5 py-1 text-sm font-semibold text-emerald-700 bg-emerald-50 rounded">
                발행됨
              </span>
            ) : (
              <span className="inline-block px-2.5 py-1 text-sm font-semibold text-amber-700 bg-amber-50 rounded">
                미발행 (임시 보관)
              </span>
            )}
            <span className="text-sm text-grey-600">
              {isPublished
                ? "공개 상태입니다. 비공개로 돌리면 /blog 목록·sitemap 에서 제외됩니다."
                : "아직 공개되지 않았습니다. 발행하면 /blog 에 즉시 노출."}
            </span>
          </div>
        </div>
        <form action={togglePublish}>
          <button
            type="submit"
            className={`px-4 py-2 text-sm font-semibold rounded-lg text-white ${
              isPublished ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {isPublished ? "비공개로 전환" : "발행하기"}
          </button>
        </form>
      </div>

      {/* 편집 폼 */}
      <form action={saveBlogPost} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-grey-700 mb-1.5">
            제목 <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            name="title"
            defaultValue={post.title}
            required
            className="w-full h-11 px-3 text-sm border border-grey-300 rounded-lg focus:outline-none focus:border-grey-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-grey-700 mb-1.5">
            도입부 (meta description)
          </label>
          <textarea
            name="meta_description"
            defaultValue={post.meta_description ?? ""}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-grey-300 rounded-lg focus:outline-none focus:border-grey-500 leading-[1.6]"
          />
          <p className="mt-1.5 text-sm text-grey-600 leading-[1.6]">
            본문 상단 리드 문장이자 검색결과 설명문으로 사용됩니다. HTML 태그는
            저장 시 자동 제거됩니다 (평문 권장, 100~160자).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-grey-700 mb-1.5">
              카테고리
            </label>
            <input
              type="text"
              name="category"
              defaultValue={post.category ?? ""}
              placeholder="예: 청년 · 노년 · 주거 · 자영업"
              className="w-full h-11 px-3 text-sm border border-grey-300 rounded-lg focus:outline-none focus:border-grey-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-grey-700 mb-1.5">
              태그 (쉼표 구분)
            </label>
            <input
              type="text"
              name="tags"
              defaultValue={tagsString}
              placeholder="예: 청년취업, 코업, 부산"
              className="w-full h-11 px-3 text-sm border border-grey-300 rounded-lg focus:outline-none focus:border-grey-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-grey-700 mb-1.5">
            커버 이미지 URL
          </label>
          <input
            type="url"
            name="cover_image"
            defaultValue={post.cover_image ?? ""}
            placeholder="https://..."
            className="w-full h-11 px-3 text-sm border border-grey-300 rounded-lg focus:outline-none focus:border-grey-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-grey-700 mb-1.5">
            본문
          </label>
          {/* 워드프레스 클래식 에디터 스타일 비주얼 에디터.
              내부에 hidden <input name="content"> 가 있어 form action 그대로 작동.
              우측 상단 "HTML" 버튼으로 raw HTML 직접 편집도 가능. */}
          <RichEditor initialHtml={post.content ?? ""} name="content" />
          <p className="mt-1.5 text-sm text-grey-600 leading-[1.6]">
            툴바로 제목·강조·목록·표·이미지 삽입. 우측 &quot;HTML&quot; 버튼으로 원본 편집 가능.
            저장 후 /blog 페이지가 자동 재생성됩니다.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="px-6 py-2.5 text-sm font-semibold text-white bg-grey-900 rounded-lg hover:bg-grey-800"
          >
            변경사항 저장
          </button>
          <Link
            href="/admin/blog"
            className="px-6 py-2.5 text-sm font-medium text-grey-700 border border-grey-300 rounded-lg hover:bg-grey-50 no-underline"
          >
            취소
          </Link>
        </div>
      </form>
    </main>
  );
}
