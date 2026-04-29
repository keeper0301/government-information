"use client";

// ============================================================
// 모바일 햄버거 + slide-in 사이드바 (md 미만)
// ============================================================
// md 이상에선 sidebar 가 layout 에서 직접 렌더되므로 본 컴포넌트는 hidden.
// ESC·overlay 클릭·메뉴 항목 클릭 모두 닫기.
// ============================================================

import { useState, useEffect } from "react";
import { Sidebar } from "./sidebar";

export function SidebarMobileToggle() {
  const [isOpen, setIsOpen] = useState(false);

  // ESC 닫기
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
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
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="메뉴 열기"
        aria-expanded={isOpen}
        className="md:hidden fixed top-3 left-3 z-40 w-11 h-11 bg-white border border-[#E5E8EB] rounded-lg flex items-center justify-center text-[20px] cursor-pointer shadow-sm"
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
      <div
        role="dialog"
        aria-label="어드민 메뉴"
        aria-modal={isOpen}
        className={`md:hidden fixed top-0 left-0 bottom-0 w-[78%] max-w-[300px] z-50 bg-[#F7F8FA] shadow-[4px_0_16px_rgba(0,0,0,0.06)] transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
        }`}
      >
        {/* 닫기 버튼 — 우상단 */}
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label="메뉴 닫기"
          className="absolute top-3 right-3 z-10 w-10 h-10 bg-[#3182F6] text-white rounded-lg flex items-center justify-center text-[18px] cursor-pointer"
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
