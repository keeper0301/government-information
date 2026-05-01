"use client";

// ============================================================
// 어드민 사이드바 — 메뉴 그룹 5개 + 활성 highlight
// ============================================================
// 'use client' 이유: usePathname 으로 활성 메뉴 매칭.
// onItemClick prop: 모바일 토글에서 메뉴 클릭 시 닫기 연결용 (옵션).
// ============================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_MENU, findActiveMenuItem } from "@/lib/admin/menu";

type Props = {
  onItemClick?: () => void;
};

export function Sidebar({ onItemClick }: Props) {
  const pathname = usePathname() ?? "/admin";
  const activeItem = findActiveMenuItem(pathname);
  const activeHref = activeItem?.href ?? null;

  // 메인 대시보드는 별도 (그룹 항목 외)
  const isDashboardActive = pathname === "/admin" || pathname.startsWith("/admin?");

  // I-1 special-case: /admin/users/{userId} 동적 페이지에서도 "사용자 조회" 메뉴 활성 highlight
  // (anchor href "/admin#user-search" 는 findActiveMenuItem prefix 매칭에서 제외되므로 별도 처리)
  const isUserDetailActive = pathname.startsWith("/admin/users/");

  return (
    <nav
      aria-label="어드민 메뉴"
      // scrollbar 시각만 숨김 (기능 보존) — 작은 화면에선 스크롤은 동작.
      // Firefox: scrollbar-width:none / WebKit: ::-webkit-scrollbar hidden
      className="bg-grey-50 border-r border-grey-200 py-6 h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {/* 브랜드 */}
      <div className="px-6 pb-4 mb-3 border-b border-grey-200">
        <div className="text-lg font-extrabold tracking-[-0.03em] text-grey-900">
          keepioo
        </div>
        <div className="text-xs text-grey-500 mt-1 tracking-[0.1em] font-bold">
          ADMIN
        </div>
      </div>

      {/* 빠른 검색 (CmdK) trigger — input 처럼 보이지만 클릭 시 모달 호출.
          실제 검색은 CmdKPalette 컴포넌트에서 처리 (Ctrl/Cmd+K 동일 동작). */}
      <button
        type="button"
        onClick={() => {
          // 사이드바 (client) → CmdK (client) 직접 import 시 순환·생명주기 복잡.
          // 윈도우 커스텀 이벤트로 결합도 낮춰 호출.
          window.dispatchEvent(new Event("cmdk:open"));
          // 모바일 drawer 열려있을 경우 같이 닫음
          if (onItemClick) onItemClick();
        }}
        className="mx-4 mb-4 flex items-center gap-2 w-[calc(100%-2rem)] px-3 py-2 text-sm text-grey-500 bg-white border border-grey-200 rounded-lg hover:border-blue-300 hover:text-grey-700"
      >
        <span aria-hidden>🔍</span>
        <span className="flex-1 text-left">페이지 검색</span>
        <kbd className="text-xs text-grey-500 px-1.5 py-0.5 border border-grey-200 rounded bg-grey-50">
          Ctrl K
        </kbd>
      </button>

      {/* 메인 대시보드 */}
      <Link
        href="/admin"
        onClick={onItemClick}
        className={
          isDashboardActive
            ? "flex items-center gap-2.5 px-6 py-3.5 text-sm font-bold bg-blue-50 border-l-[3px] border-blue-500 text-blue-500 pl-[21px] no-underline"
            : "flex items-center gap-2.5 px-6 py-3.5 text-sm font-bold text-grey-700 hover:bg-grey-100 no-underline"
        }
      >
        <span className="text-lg">🏠</span>
        대시보드
      </Link>

      {/* 그룹 5개 */}
      {ADMIN_MENU.map((group) => (
        <div key={group.number}>
          <div className="px-6 pt-5 pb-2 text-xs tracking-[0.12em] uppercase font-bold text-grey-500">
            {group.number}. {group.title}
          </div>
          {group.items.map((item) => {
            // 일반 활성 매칭 + "사용자 조회" 항목은 /admin/users/{id} 동적 경로도 활성
            const isActive =
              item.href === activeHref ||
              (item.href === "/admin#user-search" && isUserDetailActive);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onItemClick}
                className={
                  isActive
                    ? "flex items-center gap-2.5 py-3 text-sm font-bold bg-blue-50 border-l-[3px] border-blue-500 text-blue-500 pl-[33px] pr-6 no-underline"
                    : "flex items-center gap-2.5 py-3 pl-9 pr-6 text-sm text-grey-700 hover:bg-grey-100 no-underline"
                }
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
