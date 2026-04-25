// ============================================================
// /mypage/bookmarks — 사용자가 찜한 정책 모아보기
// ============================================================
// 정책 상세에서 ★ 클릭 → 여기서 한눈에 모아 봄.
// welfare/loan 합쳐서 최신순. 마감일 가까운 순으로 정렬할 수도 있는데,
// 운영 초기엔 사용량이 적어 단순하게 최신순만 제공.
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyBookmarks } from "@/lib/bookmarks";
import { CompareForm } from "./compare-form";

export const metadata: Metadata = {
  title: "찜한 정책 — keepioo",
  description: "마음에 드는 정책을 모아둔 페이지. 마감일을 한눈에 확인하세요.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function BookmarksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/bookmarks");

  const items = await getMyBookmarks();

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
      <p className="text-[14px] text-grey-600 mb-8">
        정책 상세 페이지의 ☆ 버튼으로 찜할 수 있어요. 최대 200건 보관됩니다.
      </p>

      {items.length === 0 ? (
        <div className="rounded-2xl bg-blue-50 border border-blue-100 p-8 text-center">
          <p className="text-[16px] text-grey-900 font-semibold mb-2">
            아직 찜한 정책이 없어요
          </p>
          <p className="text-[13px] text-grey-700 mb-5">
            관심 있는 복지·대출 정책의 상세 페이지에서 ★ 버튼을 눌러보세요.
          </p>
          <div className="flex justify-center gap-3">
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
      ) : (
        <CompareForm items={items} />
      )}
    </main>
  );
}
