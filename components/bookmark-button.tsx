"use client";

// ============================================================
// BookmarkButton — 정책 상세 페이지 별표 토글
// ============================================================
// 비로그인 → 로그인 페이지로 안내 (next 파라미터로 현재 URL 보존).
// 로그인 → 클릭 시 toggleBookmark 호출, optimistic update 로 즉시 시각 반영.
// ============================================================

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toggleBookmark } from "@/lib/bookmarks";
import type { ProgramType } from "@/lib/bookmarks";

type Props = {
  programType: ProgramType;
  programId: string;
  initialBookmarked: boolean;
  isLoggedIn: boolean;
};

export function BookmarkButton({
  programType,
  programId,
  initialBookmarked,
  isLoggedIn,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);

    // 비로그인 — 로그인 페이지로 보내고 돌아오면 다시 클릭 유도
    if (!isLoggedIn) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    // optimistic update — 사용자 체감 속도 우선
    const next = !bookmarked;
    setBookmarked(next);

    startTransition(async () => {
      const result = await toggleBookmark(programType, programId);
      if (!result.ok) {
        // 실패 시 원상복구
        setBookmarked(!next);
        setError(result.error ?? "북마크 처리 실패");
        return;
      }
      // 서버 결과로 최종 상태 동기화 (optimistic 과 다를 수 있음 — 동시성)
      if (typeof result.bookmarked === "boolean") {
        setBookmarked(result.bookmarked);
      }
    });
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-pressed={bookmarked}
        aria-label={bookmarked ? "북마크 해제" : "북마크 추가"}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors text-[13px] font-semibold ${
          bookmarked
            ? "bg-yellow-50 border-yellow-300 text-yellow-800 hover:bg-yellow-100"
            : "bg-white border-grey-300 text-grey-700 hover:bg-grey-50"
        } ${pending ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
      >
        <span aria-hidden className="text-[15px]">
          {bookmarked ? "★" : "☆"}
        </span>
        {bookmarked ? "찜한 정책" : "찜하기"}
      </button>
      {error && (
        <p role="alert" className="text-[11px] text-red">
          {error}
        </p>
      )}
    </div>
  );
}
