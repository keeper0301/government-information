"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

// 로그인 상태에 따라 다른 UI를 보여주는 컴포넌트
// - 로그인 안 됨: "로그인" 버튼 → /login 페이지로 이동
// - 로그인 됨: 이메일 첫 글자 아바타 + 드롭다운(이메일 표시 + 로그아웃)
// mobile=true 로 넘기면 햄버거 메뉴 안쪽 스타일로 렌더링됨.
// onNavigate: mobile 모드에서 링크·로그아웃 선택 시 부모(Nav) 에 알려 햄버거 닫기용.
// isAdmin: layout.tsx 에서 서버 판정한 어드민 여부 — 어드민 한정 메뉴 진입 링크 노출용.
type UserMenuProps = {
  mobile?: boolean;
  onNavigate?: () => void;
  isAdmin?: boolean;
};

export function UserMenu({ mobile = false, onNavigate, isAdmin = false }: UserMenuProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 현재 로그인 상태 확인 + 로그인/로그아웃 이벤트 구독
  useEffect(() => {
    const supabase = createClient();
    // 최초 렌더 시 현재 유저 조회
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });
    // 이후 다른 탭 로그인/로그아웃 같은 상태 변화를 실시간 반영
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  // 드롭다운 바깥을 클릭하면 자동으로 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // 로그아웃: 세션 삭제 → 홈으로 이동 → 서버 컴포넌트 재검증
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    onNavigate?.();
    router.push("/");
    router.refresh();
  }

  // 로딩 중엔 실제 렌더될 버튼과 같은 크기의 빈 자리를 잡아 레이아웃이 튀는 걸 방지
  // - 데스크톱: 로그인 버튼(약 76x44) / 아바타(36x36) 중 평균인 76x44 로 잡음(대부분 비로그인 상태)
  // - 모바일: 로그인 텍스트 행(약 48px)
  if (loading) {
    return (
      <div
        className={mobile ? "h-12" : "ml-3 w-[76px] min-h-[44px]"}
        aria-hidden="true"
      />
    );
  }

  // === 로그인 안 된 상태 ===
  if (!user) {
    if (mobile) {
      return (
        <a
          href="/login"
          onClick={onNavigate}
          className="block px-4 py-3 text-[15px] font-semibold text-blue-500 no-underline"
        >
          로그인
        </a>
      );
    }
    return (
      <a
        href="/login"
        className="ml-3 px-4 py-[7px] text-sm font-semibold text-blue-500 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors no-underline min-h-[44px] flex items-center"
      >
        로그인
      </a>
    );
  }

  // === 로그인 된 상태 === (이메일 첫 글자로 아바타 만들기)
  const initial = (user.email?.[0] || "U").toUpperCase();

  // 모바일: 햄버거 메뉴 하단에 이메일·(어드민)·내 정보·로그아웃 순서로
  if (mobile) {
    return (
      <div className="border-t border-grey-100 mt-2 pt-2">
        <div className="px-4 py-2 text-[13px] text-grey-600 truncate">
          {user.email}
        </div>
        {isAdmin && (
          <a
            href="/admin"
            onClick={onNavigate}
            className="block px-4 py-3 text-[15px] font-semibold text-burgundy hover:bg-grey-50 rounded-lg no-underline"
          >
            어드민 대시보드
          </a>
        )}
        <a
          href="/mypage"
          onClick={onNavigate}
          className="block px-4 py-3 text-[15px] font-medium text-grey-700 hover:bg-grey-50 rounded-lg no-underline"
        >
          내 정보
        </a>
        <a
          href="/mypage/billing"
          onClick={onNavigate}
          className="block px-4 py-3 text-[15px] font-medium text-grey-700 hover:bg-grey-50 rounded-lg no-underline"
        >
          내 구독
        </a>
        <button
          onClick={handleLogout}
          className="w-full text-left px-4 py-3 text-[15px] font-medium text-grey-700 hover:bg-grey-50 rounded-lg border-none bg-transparent cursor-pointer"
        >
          로그아웃
        </button>
      </div>
    );
  }

  // 데스크톱: 원형 아바타 + 드롭다운(이메일 → 내 정보 → 로그아웃)
  return (
    <div ref={menuRef} className="relative ml-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-11 h-11 rounded-full bg-blue-500 text-white text-sm font-semibold grid place-items-center border-none cursor-pointer hover:bg-blue-600 transition-colors"
        aria-label="내 계정 메뉴"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-[220px] bg-white border border-grey-100 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] py-1 overflow-hidden">
          <div className="px-4 py-2 text-[13px] text-grey-600 truncate border-b border-grey-100">
            {user.email}
          </div>
          {isAdmin && (
            <a
              href="/admin"
              className="block px-4 py-2.5 text-[14px] font-semibold text-burgundy hover:bg-grey-50 no-underline border-b border-grey-100"
              onClick={() => setOpen(false)}
            >
              어드민 대시보드
            </a>
          )}
          <a
            href="/mypage"
            className="block px-4 py-2.5 text-[14px] text-grey-700 hover:bg-grey-50 no-underline"
            onClick={() => setOpen(false)}
          >
            내 정보
          </a>
          <a
            href="/mypage/billing"
            className="block px-4 py-2.5 text-[14px] text-grey-700 hover:bg-grey-50 no-underline"
            onClick={() => setOpen(false)}
          >
            내 구독
          </a>
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2.5 text-[14px] text-grey-700 hover:bg-grey-50 border-none bg-transparent cursor-pointer"
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
