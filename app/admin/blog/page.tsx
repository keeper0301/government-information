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
// admin sub page 표준 헤더 — kicker · title · description 슬롯 통일
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const metadata: Metadata = {
  title: "블로그 관리 | 어드민",
  robots: { index: false, follow: false },
};

type SearchParams = {
  q?: string;
  status?: "all" | "published" | "draft";
  quality?: "all" | "needs_review" | "pending_review" | "approved";
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
  const { q = "", status = "all", quality = "all", page: pageRaw = "1" } = await searchParams;
  const page = Math.max(1, parseInt(pageRaw, 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const admin = createAdminClient();
  let query = admin
    .from("blog_posts")
    .select("id, slug, title, category, tags, published_at, updated_at, view_count, admin_review_required, admin_review_score, admin_reviewed_at", {
      count: "exact",
    })
    .order("updated_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (q.trim()) {
    // title / slug 둘 중 한 쪽이라도 부분 매칭.
    // PostgREST or() 는 쉼표(,) 와 괄호(,)) 를 필드 구분자/그루핑으로 해석 →
    // 사용자 입력에 섞여 있으면 쿼리 파서가 깨짐. ilike wildcard 역할인 % 도
    // 입력으로 들어오면 의도와 달라지므로 함께 제거. 공백은 유지.
    const safe = q.trim().replace(/[,()%]/g, "");
    if (safe) {
      query = query.or(`title.ilike.%${safe}%,slug.ilike.%${safe}%`);
    }
  }
  if (status === "published") query = query.not("published_at", "is", null);
  else if (status === "draft") query = query.is("published_at", null);
  if (quality === "needs_review") query = query.eq("admin_review_required", true);
  else if (quality === "pending_review") query = query.is("admin_reviewed_at", null);
  else if (quality === "approved") query = query.eq("admin_review_required", false);

  const { data: posts, count, error } = await query;

  if (error) {
    return (
      <main className="pt-28 pb-20 max-w-content mx-auto px-6 lg:px-10">
        <h1 className="text-3xl font-bold text-grey-900 mb-4">블로그 관리</h1>
        <p className="text-red-600">조회 실패: {error.message}</p>
      </main>
    );
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isQualityReviewQueue = quality === "needs_review";

  function buildHref(p: { q?: string; status?: string; quality?: string; page?: number }) {
    const sp = new URLSearchParams();
    if (p.q !== undefined ? p.q : q) sp.set("q", p.q !== undefined ? p.q : q);
    if ((p.status ?? status) !== "all") sp.set("status", p.status ?? status);
    if ((p.quality ?? quality) !== "all") sp.set("quality", p.quality ?? quality);
    if ((p.page ?? page) > 1) sp.set("page", String(p.page ?? page));
    const s = sp.toString();
    return s ? `/admin/blog?${s}` : "/admin/blog";
  }

  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-6 lg:px-10">
      {/* 표준 헤더 슬롯 — F4 마이그레이션 */}
      <AdminPageHeader
        kicker="ADMIN · 컨텐츠 발행"
        title="블로그 관리"
        description={
          isQualityReviewQueue
            ? `외부 발행을 막는 품질 보류 ${total.toLocaleString("ko-KR")}건 · 수정 → LLM 재검수 → 승인 순서로 처리`
            : `블로그 글 ${total.toLocaleString("ko-KR")} 건 · 최근 수정 순`
        }
      />

      {isQualityReviewQueue && (
        <section className="mb-5 rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-red-700">
                외부 발행 차단 해소 순서
              </div>
              <h2 className="mt-1 text-lg font-extrabold text-red-950">
                보류 글 {total.toLocaleString("ko-KR")}건을 하나씩 열어 improvements를 반영하세요
              </h2>
              <p className="mt-2 text-sm text-red-900">
                score 2 이하 글은 바로 수동 승인하지 말고, 본문 수정 후 LLM 재검수를 먼저 실행합니다.
                운영자가 사실·품질을 직접 확인한 경우에만 수동 품질 승인을 사용하세요.
              </p>
            </div>
            <ol className="grid min-w-[240px] gap-2 text-sm font-semibold text-red-900">
              <li>1. 글 열기</li>
              <li>2. improvements 반영·저장</li>
              <li>3. LLM 재검수</li>
              <li>4. 통과 또는 직접 확인 후 승인</li>
            </ol>
          </div>
        </section>
      )}

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
          className="flex-1 min-w-[200px] h-10 px-3 text-sm border border-grey-300 rounded-lg focus:outline-none focus:border-grey-500"
        />
        <select
          name="status"
          defaultValue={status}
          className="h-10 px-3 text-sm border border-grey-300 rounded-lg bg-white"
        >
          <option value="all">전체 상태</option>
          <option value="published">발행</option>
          <option value="draft">미발행</option>
        </select>
        <select
          name="quality"
          defaultValue={quality}
          className="h-10 px-3 text-sm border border-grey-300 rounded-lg bg-white"
        >
          <option value="all">전체 품질</option>
          <option value="needs_review">품질 보류</option>
          <option value="pending_review">미검수</option>
          <option value="approved">품질 승인</option>
        </select>
        <button
          type="submit"
          className="h-10 px-4 text-sm font-semibold text-white bg-grey-900 rounded-lg hover:bg-grey-800"
        >
          검색
        </button>
      </form>

      {/* 목록 테이블 */}
      {posts && posts.length > 0 ? (
        <div className="border border-grey-200 rounded-xl bg-white overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_100px_110px_100px_80px] gap-3 items-center px-4 py-3 bg-grey-50 border-b border-grey-200 text-sm font-semibold text-grey-700">
            <div>제목</div>
            <div>카테고리</div>
            <div>상태</div>
            <div>품질</div>
            <div className="text-right">조회수</div>
            <div className="text-right">액션</div>
          </div>
          {posts.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[1fr_120px_100px_110px_100px_80px] gap-3 items-center px-4 py-3 border-b border-grey-100 last:border-b-0 hover:bg-grey-50 transition-colors"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/blog/${p.id}`}
                  className="text-sm text-grey-900 font-medium hover:underline no-underline block truncate"
                >
                  {p.title}
                </Link>
                <div className="text-xs text-grey-600 truncate mt-0.5">
                  /blog/{p.slug} · 수정 {new Date(p.updated_at).toLocaleString("ko-KR")}
                </div>
              </div>
              <div className="text-sm text-grey-700">{p.category || "—"}</div>
              <div>
                {p.published_at ? (
                  <span className="inline-block px-2 py-0.5 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded">
                    발행
                  </span>
                ) : (
                  <span className="inline-block px-2 py-0.5 text-xs font-semibold text-amber-700 bg-amber-50 rounded">
                    미발행
                  </span>
                )}
              </div>
              <div>
                {p.admin_review_required ? (
                  <span className="inline-block px-2 py-0.5 text-xs font-semibold text-red-700 bg-red-50 rounded">
                    보류 {typeof p.admin_review_score === "number" ? `· ${p.admin_review_score}점` : ""}
                  </span>
                ) : p.admin_reviewed_at ? (
                  <span className="inline-block px-2 py-0.5 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded">
                    승인 {typeof p.admin_review_score === "number" ? `· ${p.admin_review_score}점` : ""}
                  </span>
                ) : (
                  <span className="inline-block px-2 py-0.5 text-xs font-semibold text-grey-700 bg-grey-100 rounded">
                    미검수
                  </span>
                )}
              </div>
              <div className="text-sm text-grey-700 text-right">
                {(p.view_count ?? 0).toLocaleString("ko-KR")}
              </div>
              <div className="text-right">
                <Link
                  href={`/admin/blog/${p.id}`}
                  className={`inline-block px-3 py-1 text-xs font-semibold rounded no-underline ${
                    isQualityReviewQueue
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  }`}
                >
                  {isQualityReviewQueue ? "처리" : "수정"}
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-grey-200 rounded-xl bg-white p-8 text-center text-sm text-grey-600">
          조건에 맞는 글이 없습니다.
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          {page > 1 && (
            <Link
              href={buildHref({ page: page - 1 })}
              className="px-3 py-1.5 text-sm border border-grey-300 rounded-lg no-underline hover:bg-grey-50"
            >
              이전
            </Link>
          )}
          <span className="text-sm text-grey-600">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={buildHref({ page: page + 1 })}
              className="px-3 py-1.5 text-sm border border-grey-300 rounded-lg no-underline hover:bg-grey-50"
            >
              다음
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
