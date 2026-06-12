"use client";

// ============================================================
// BookmarkButton — 정책 상세 페이지 별표 토글
// ============================================================
// 비로그인 → 로그인 페이지로 안내 (next 파라미터로 현재 URL 보존).
// 로그인 → 클릭 시 toggleBookmark 호출, optimistic update 로 즉시 시각 반영.
// ============================================================

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toggleBookmark, isBookmarked } from "@/lib/bookmarks";
import { createClient } from "@/lib/supabase/client";
import type { ProgramType } from "@/lib/bookmarks";

type Props = {
  programType: ProgramType;
  programId: string;
  // 2026-06-13 — 정적 ISR 페이지(welfare 상세)는 서버에서 쿠키를 안 읽으므로 이 두 값을
  // 생략한다. 생략 시(undefined) 컴포넌트가 mount 후 클라이언트에서 직접 로그인·북마크
  // 상태를 self-fetch 한다. 동적 페이지(loan 상세 등)는 기존대로 props 전달 → self-fetch 안 함.
  initialBookmarked?: boolean;
  isLoggedIn?: boolean;
};

export function BookmarkButton({
  programType,
  programId,
  initialBookmarked,
  isLoggedIn: isLoggedInProp,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  // props 미지정(정적 페이지) = self-fetch 모드.
  const selfFetch = isLoggedInProp === undefined;
  const [bookmarked, setBookmarked] = useState(initialBookmarked ?? false);
  const [isLoggedIn, setIsLoggedIn] = useState(isLoggedInProp ?? false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 정적 페이지: mount 후 클라이언트에서 로그인·북마크 상태 확인(쿠키 서버 읽기 없이).
  useEffect(() => {
    if (!selfFetch) return;
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled || !data.user) return;
        setIsLoggedIn(true);
        isBookmarked(programType, programId).then((b) => {
          if (!cancelled) setBookmarked(b);
        });
      });
    return () => {
      cancelled = true;
    };
  }, [selfFetch, programType, programId]);

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
