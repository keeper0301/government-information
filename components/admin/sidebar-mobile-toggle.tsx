"use client";

// ============================================================
// 모바일 햄버거 + slide-in 사이드바 (md 미만)
// ============================================================
// md 이상에선 sidebar 가 layout 에서 직접 렌더되므로 본 컴포넌트는 hidden.
// ESC·overlay 클릭·메뉴 항목 클릭 모두 닫기.
// 접근성 (a11y) 보강:
//  - 열림 시 닫기 버튼으로 자동 focus 이동
//  - 닫힘 시 햄버거 버튼으로 focus 복귀
//  - aria-hidden 으로 screen reader 가 닫힌 drawer 무시
//  - aria-controls / id 매칭으로 햄버거 ↔ drawer 연결
//  - Tab/Shift+Tab focus trap (drawer 밖 탈출 차단)
// ============================================================

import { useState, useEffect, useRef } from "react";
import { Sidebar } from "./sidebar";

export function SidebarMobileToggle() {
  const [isOpen, setIsOpen] = useState(false);

  // 햄버거 / 닫기 / drawer 본체에 대한 ref — focus 제어용
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // 첫 mount 직후엔 focus 이동을 건너뛰기 위한 가드
  // (페이지 진입과 동시에 햄버거가 갑자기 focus 되는 사고 방지)
  const mountedRef = useRef(false);

  // 열림/닫힘 시 focus 이동
  // - 열림: 닫기 버튼 (×) 으로 focus 이동 → 즉시 ESC/Tab 이용 가능
  // - 닫힘: 햄버거 버튼 (☰) 으로 focus 복귀 → 키보드 사용자 제자리 유지
  useEffect(() => {
    if (isOpen) {
      // 다음 tick 으로 미뤄서 transition 시작 후 focus 이동
      // (translate 애니메이션 도중 focus 가 가도 시각적 문제 없음)
      closeBtnRef.current?.focus();
      mountedRef.current = true;
    } else if (mountedRef.current) {
      // 첫 mount 시엔 focus 복귀 안 함 — 사용자가 한 번이라도 연 적이 있을 때만 복귀
      hamburgerRef.current?.focus();
    }
  }, [isOpen]);

  // 통합 키보드 핸들러 — ESC 닫기 + Tab focus trap
  // drawer 밖으로 Tab focus 가 새지 않도록 첫/마지막 focusable 사이를 wrap-around
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      // ESC 로 닫기
      if (e.key === "Escape") {
        setIsOpen(false);
        return;
      }
      // Tab focus trap — drawer 안에서만 순환
      if (e.key === "Tab" && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        // Shift+Tab + 첫 요소 → 마지막으로 wrap
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          // Tab + 마지막 요소 → 처음으로 wrap
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  // body scroll lock 시 오픈 — 사이드바 열렸을 때 뒤 콘텐츠 스크롤 방지
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isOpen]);

  return (
    <>
      {/* 햄버거 버튼 — 모바일만 (md 미만) */}
      <button
        ref={hamburgerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="메뉴 열기"
        aria-expanded={isOpen}
        aria-controls="admin-mobile-drawer"
        className="md:hidden fixed top-3 left-3 z-40 w-11 h-11 bg-white border border-grey-200 rounded-lg flex items-center justify-center text-[20px] cursor-pointer shadow-sm"
      >
        ☰
      </button>

      {/* dim 오버레이 — 클릭 시 닫기 */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          aria-hidden
        />
      )}

      {/* 슬라이드 사이드바 — translate-x 로 좌측 슬라이드 인/아웃 */}
      {/* aria-hidden 은 닫힘 상태일 때만 true — screen reader 가 무시 */}
      <div
        ref={drawerRef}
        id="admin-mobile-drawer"
        role="dialog"
        aria-label="어드민 메뉴"
        aria-modal={isOpen}
        aria-hidden={!isOpen}
        className={`md:hidden fixed top-0 left-0 bottom-0 w-[78%] max-w-[300px] z-50 bg-grey-50 shadow-[4px_0_16px_rgba(0,0,0,0.06)] transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
        }`}
      >
        {/* 닫기 버튼 — 우상단 */}
        <button
          ref={closeBtnRef}
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label="메뉴 닫기"
          className="absolute top-3 right-3 z-10 w-10 h-10 bg-blue-500 text-white rounded-lg flex items-center justify-center text-[18px] cursor-pointer"
        >
          ×
        </button>
        {/* Sidebar 자체 — 메뉴 항목 클릭 시 자동 닫힘 (onItemClick) */}
        <div className="h-full overflow-y-auto pt-14">
          <Sidebar onItemClick={() => setIsOpen(false)} />
        </div>
      </div>
    </>
  );
}
