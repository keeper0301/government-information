// ============================================================
// /mypage/bookmarks — 사용자가 찜한 정책 모아보기
// ============================================================
// 정책 상세에서 ★ 클릭 → 여기서 한눈에 모아 봄.
// Phase 4 C2: URL 기반 정렬·필터.
//   ?sort = recent | deadline | title (default: recent)
//   ?type = welfare | loan | all      (default: all)
//
// SSR 단계에서 sortBookmarks (pure function) 로 정렬 후 CompareForm 에 전달.
// CompareForm 은 client component 라 정렬은 서버에서 끝내고 결과만 보낸다.
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyBookmarks, type BookmarkItem } from "@/lib/bookmarks";
import { sortBookmarks, type SortMode, type SortableBookmark } from "@/lib/mypage/bookmark-sort";
import { CompareForm } from "./compare-form";

export const metadata: Metadata = {
  title: "찜한 정책 — keepioo",
  description: "마음에 드는 정책을 모아둔 페이지. 마감일을 한눈에 확인하세요.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// 사용자가 URL ?type= 으로 선택 가능한 필터 모드
type TypeFilter = "welfare" | "loan" | "all";

// BookmarkItem (lib/bookmarks.ts) 은 camelCase 필드를 쓰고,
// sortBookmarks 는 snake_case (created_at·apply_end) 를 요구한다.
// 정렬용 임시 구조 (SortableBookmark) 로 변환했다가 정렬 후 원본을 다시 구성.
function toSortable(it: BookmarkItem): SortableBookmark {
  return {
    id: it.programId,
    type: it.programType,
    title: it.title,
    apply_end: it.applyEnd,
    created_at: it.bookmarkedAt,
  };
}

export default async function BookmarksPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; type?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/bookmarks");

  const params = await searchParams;
  // 정렬 모드 — 화이트리스트 검증
  const sortMode: SortMode =
    params.sort === "deadline" || params.sort === "title" ? params.sort : "recent";
  // 타입 필터 — 기본 all
  const typeFilter: TypeFilter =
    params.type === "welfare" || params.type === "loan" ? params.type : "all";

  // 1) 사용자 북마크 전체 조회 (lib/bookmarks 가 created_at desc 로 limit 200)
  const allItems = await getMyBookmarks();

  // 2) 타입 필터 — welfare/loan/all
  const filtered =
    typeFilter === "all"
      ? allItems
      : allItems.filter((it) => it.programType === typeFilter);

  // 3) 정렬 — pure function 에 SortableBookmark 형태로 매핑해서 전달.
  //    원본 BookmarkItem 순서를 정렬 결과에 맞춰 재배치한다.
  const sortableInput = filtered.map(toSortable);
  const sorted = sortBookmarks(sortableInput, sortMode);
  // sorted 의 순서를 따라 원본 BookmarkItem 배열을 재구성.
  // (composite key = type:id 로 매칭 — id 만으로는 welfare·loan 충돌 가능)
  const itemMap = new Map(
    filtered.map((it) => [`${it.programType}:${it.programId}`, it]),
  );
  const items: BookmarkItem[] = sorted
    .map((s) => itemMap.get(`${s.type}:${s.id}`))
    .filter((it): it is BookmarkItem => it !== undefined);

  // 빈 상태 — "처음부터 0건" 과 "필터 적용 결과 0건" 두 케이스
  const hasAny = allItems.length > 0;
  const isFiltered = typeFilter !== "all";

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <div className="mb-6">
        <Link href="/mypage" className="text-sm text-blue-600 hover:underline">
          ← 마이페이지
        </Link>
      </div>

      <h1 className="text-[28px] font-bold tracking-[-0.6px] text-grey-900 mb-2">
        찜한 정책
      </h1>
      <p className="text-[14px] text-grey-600 mb-6">
        정책 상세 페이지의 ☆ 버튼으로 찜할 수 있어요. 최대 200건 보관됩니다.
      </p>

      {/* 정렬·필터 — 북마크가 있을 때만 표시 (없으면 빈 상태 안내가 우선) */}
      {hasAny && (
        <form
          method="get"
          action="/mypage/bookmarks"
          className="mb-5 bg-white border border-grey-200 rounded-xl p-4 flex flex-wrap items-end gap-3"
        >
          <label className="text-sm font-medium text-grey-700">
            <span className="block mb-1">정렬</span>
            <select
              name="sort"
              defaultValue={sortMode}
              className="px-3 py-2 border border-grey-200 rounded-lg text-sm text-grey-900 focus:border-blue-500 outline-none"
            >
              <option value="recent">최근 찜한 순</option>
              <option value="deadline">마감 임박순</option>
              <option value="title">제목 가나다순</option>
            </select>
          </label>
          <label className="text-sm font-medium text-grey-700">
            <span className="block mb-1">유형</span>
            <select
              name="type"
              defaultValue={typeFilter}
              className="px-3 py-2 border border-grey-200 rounded-lg text-sm text-grey-900 focus:border-blue-500 outline-none"
            >
              <option value="all">전체</option>
              <option value="welfare">복지</option>
              <option value="loan">대출</option>
            </select>
          </label>
          <button
            type="submit"
            className="min-h-[44px] px-4 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            적용
          </button>
          {(sortMode !== "recent" || typeFilter !== "all") && (
            <Link
              href="/mypage/bookmarks"
              className="min-h-[44px] px-4 inline-flex items-center text-sm font-semibold rounded-lg border border-grey-200 text-grey-700 hover:bg-grey-50 no-underline"
            >
              초기화
            </Link>
          )}
          <span className="text-sm text-grey-600 ml-auto">
            {items.length}건
            {isFiltered && allItems.length !== items.length && (
              <> / 전체 {allItems.length}건</>
            )}
          </span>
        </form>
      )}

      {/* 빈 상태 분기 */}
      {!hasAny ? (
        // (1) 처음부터 북마크가 0건 — 추천 둘러보기 CTA
        <div className="rounded-2xl bg-blue-50 border border-blue-100 p-8 text-center">
          <p className="text-[16px] text-grey-900 font-semibold mb-2">
            아직 즐겨찾기가 없어요
          </p>
          <p className="text-[13px] text-grey-700 mb-5">
            관심 있는 복지·대출 정책의 상세 페이지에서 ★ 버튼을 눌러보세요.
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link
              href="/welfare"
              className="inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-white font-semibold no-underline text-[14px]"
            >
              복지 둘러보기
            </Link>
            <Link
              href="/loan"
              className="inline-block rounded-xl bg-grey-100 px-5 py-2.5 text-grey-900 font-semibold no-underline text-[14px]"
            >
              대출 둘러보기
            </Link>
          </div>
        </div>
      ) : items.length === 0 ? (
        // (2) 북마크는 있지만 필터로 0건 — 필터 초기화 안내
        <div className="rounded-xl bg-grey-50 p-8 text-center text-[14px] text-grey-700 leading-[1.7]">
          선택한 유형의 즐겨찾기가 없어요.
          <br />
          <Link href="/mypage/bookmarks" className="text-blue-600 underline">
            전체 보기
          </Link>
          로 다시 확인해 보세요.
        </div>
      ) : (
        // (3) 정상 — 정렬된 결과를 CompareForm 에 전달
        <CompareForm items={items} />
      )}
    </main>
  );
}
