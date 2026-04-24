// ============================================================
// /admin/blog — 블로그 글 관리자 목록
// ============================================================
// 한 줄당 한 글. 최근 수정순 정렬. 검색(title/slug) + 발행 상태 필터.
// 각 행에서 '수정' 눌러 /admin/blog/[id] 편집폼으로.
// 미발행 글은 발행·보관·임시로 구분해서 표시.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "블로그 관리 | 어드민",
  robots: { index: false, follow: false },
};

type SearchParams = {
  q?: string;
  status?: "all" | "published" | "draft";
  page?: string;
};

const PAGE_SIZE = 30;

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/blog");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

export default async function AdminBlogListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const { q = "", status = "all", page: pageRaw = "1" } = await searchParams;
  const page = Math.max(1, parseInt(pageRaw, 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const admin = createAdminClient();
  let query = admin
    .from("blog_posts")
    .select("id, slug, title, category, tags, published_at, updated_at, view_count", {
      count: "exact",
    })
    .order("updated_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (q.trim()) {
    // title / slug 둘 중 한 쪽이라도 부분 매칭
    query = query.or(`title.ilike.%${q.trim()}%,slug.ilike.%${q.trim()}%`);
  }
  if (status === "published") query = query.not("published_at", "is", null);
  else if (status === "draft") query = query.is("published_at", null);

  const { data: posts, count, error } = await query;

  if (error) {
    return (
      <main className="pt-28 pb-20 max-w-content mx-auto px-10 max-md:px-6">
        <h1 className="text-[28px] font-bold text-grey-900 mb-4">블로그 관리</h1>
        <p className="text-red-600">조회 실패: {error.message}</p>
      </main>
    );
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(p: { q?: string; status?: string; page?: number }) {
    const sp = new URLSearchParams();
    if (p.q !== undefined ? p.q : q) sp.set("q", p.q !== undefined ? p.q : q);
    if ((p.status ?? status) !== "all") sp.set("status", p.status ?? status);
    if ((p.page ?? page) > 1) sp.set("page", String(p.page ?? page));
    const s = sp.toString();
    return s ? `/admin/blog?${s}` : "/admin/blog";
  }

  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-10 max-md:px-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-[28px] font-bold tracking-[-0.5px] text-grey-900">
          블로그 관리
        </h1>
        <Link
          href="/admin"
          className="text-[13px] text-blue-600 hover:text-blue-700 no-underline"
        >
          ← 어드민 홈
        </Link>
      </div>
      <p className="text-[14px] text-grey-600 mb-6">
        블로그 글 {total.toLocaleString("ko-KR")} 건 · 최근 수정 순
      </p>

      {/* 검색 + 필터 — GET form 으로 URL 쿼리 제어 (SSR 친화적) */}
      <form
        method="get"
        action="/admin/blog"
        className="flex flex-wrap items-center gap-2 mb-5"
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="제목 · slug 검색"
          className="flex-1 min-w-[200px] h-10 px-3 text-[14px] border border-grey-300 rounded-lg focus:outline-none focus:border-grey-500"
        />
        <select
          name="status"
          defaultValue={status}
          className="h-10 px-3 text-[14px] border border-grey-300 rounded-lg bg-white"
        >
          <option value="all">전체 상태</option>
          <option value="published">발행</option>
          <option value="draft">미발행</option>
        </select>
        <button
          type="submit"
          className="h-10 px-4 text-[14px] font-semibold text-white bg-grey-900 rounded-lg hover:bg-grey-800"
        >
          검색
        </button>
      </form>

      {/* 목록 테이블 */}
      {posts && posts.length > 0 ? (
        <div className="border border-grey-200 rounded-xl bg-white overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_100px_100px_80px] gap-3 items-center px-4 py-3 bg-grey-50 border-b border-grey-200 text-[12px] font-semibold text-grey-700">
            <div>제목</div>
            <div>카테고리</div>
            <div>상태</div>
            <div className="text-right">조회수</div>
            <div className="text-right">액션</div>
          </div>
          {posts.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[1fr_120px_100px_100px_80px] gap-3 items-center px-4 py-3 border-b border-grey-100 last:border-b-0 hover:bg-grey-50 transition-colors"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/blog/${p.id}`}
                  className="text-[14px] text-grey-900 font-medium hover:underline no-underline block truncate"
                >
                  {p.title}
                </Link>
                <div className="text-[12px] text-grey-500 truncate">
                  /blog/{p.slug} · 수정 {new Date(p.updated_at).toLocaleString("ko-KR")}
                </div>
              </div>
              <div className="text-[13px] text-grey-700">{p.category || "—"}</div>
              <div>
                {p.published_at ? (
                  <span className="inline-block px-2 py-0.5 text-[12px] font-semibold text-emerald-700 bg-emerald-50 rounded">
                    발행
                  </span>
                ) : (
                  <span className="inline-block px-2 py-0.5 text-[12px] font-semibold text-amber-700 bg-amber-50 rounded">
                    미발행
                  </span>
                )}
              </div>
              <div className="text-[13px] text-grey-700 text-right">
                {(p.view_count ?? 0).toLocaleString("ko-KR")}
              </div>
              <div className="text-right">
                <Link
                  href={`/admin/blog/${p.id}`}
                  className="inline-block px-3 py-1 text-[12px] font-semibold text-blue-700 bg-blue-50 rounded hover:bg-blue-100 no-underline"
                >
                  수정
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-grey-200 rounded-xl bg-white p-8 text-center text-[14px] text-grey-600">
          조건에 맞는 글이 없습니다.
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          {page > 1 && (
            <Link
              href={buildHref({ page: page - 1 })}
              className="px-3 py-1.5 text-[13px] border border-grey-300 rounded-lg no-underline hover:bg-grey-50"
            >
              이전
            </Link>
          )}
          <span className="text-[13px] text-grey-600">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={buildHref({ page: page + 1 })}
              className="px-3 py-1.5 text-[13px] border border-grey-300 rounded-lg no-underline hover:bg-grey-50"
            >
              다음
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
