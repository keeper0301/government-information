"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { UserMenu } from "./user-menu";

// 메인 메뉴 항목
const mainItems = [
  { label: "복지정보", href: "/welfare" },
  { label: "대출정보", href: "/loan" },
  { label: "맞춤추천", href: "/recommend" },
  { label: "인기정책", href: "/popular" },
];

// "더보기" 드롭다운 메뉴 항목
const moreItems = [
  { label: "정책가이드", href: "/blog" },
  { label: "달력", href: "/calendar" },
  { label: "AI상담", href: "/consult" },
  { label: "알림센터", href: "/alerts" },
  { label: "요금제", href: "/pricing" },
];

// 모바일 메뉴용 전체 항목
const allItems = [...mainItems, ...moreItems];

export function Nav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // 더보기 메뉴 바깥 클릭 시 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // 페이지 이동 시 메뉴 닫기
  useEffect(() => {
    setMobileOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  // 현재 경로와 메뉴 링크 비교
  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  // 더보기 메뉴 안의 항목이 활성화인지 확인
  const moreIsActive = moreItems.some((item) => isActive(item.href));

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-[20px] backdrop-saturate-[180%] border-b border-grey-100">
      <div className="max-w-content mx-auto px-10 h-[58px] flex items-center justify-between max-md:px-5">
        {/* 로고 — Editorial Masthead (이탤릭 세리프 워드마크 + 버건디 dot) */}
        <a
          href="/"
          aria-label="keepioo · 정책알리미 홈으로"
          className="flex items-center gap-2.5 no-underline"
          style={{ fontFamily: "'Bodoni Moda', 'Didot', 'Playfair Display', Georgia, serif" }}
        >
          <span
            className="italic font-normal text-grey-900"
            style={{ fontSize: "26px", letterSpacing: "-0.9px", lineHeight: 1 }}
          >
            keepioo
          </span>
          {/* 버건디 ornament */}
          <span
            aria-hidden="true"
            style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#8A2A2A", display: "inline-block",
              marginTop: 4,
            }}
          />
          {/* 데스크톱에서만 한글 부텍스트 노출 */}
          <span
            className="hidden sm:inline-block text-grey-900"
            style={{
              fontFamily: "'Nanum Myeongjo', 'Noto Serif KR', serif",
              fontSize: "13px", fontWeight: 700, letterSpacing: "1.5px",
              borderLeft: "0.5px solid rgba(14,11,8,0.35)",
              paddingLeft: "10px", marginLeft: "2px",
            }}
          >
            정책알리미
          </span>
        </a>

        {/* 데스크톱 메뉴 */}
        <div className="hidden md:flex items-center gap-0.5">
          {/* 메인 메뉴 */}
          {mainItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`px-3.5 py-2.5 text-[15px] min-h-[44px] flex items-center rounded-lg transition-colors no-underline ${
                isActive(item.href)
                  ? "font-semibold text-grey-900"
                  : "font-medium text-grey-700 hover:bg-grey-50 hover:text-grey-900"
              }`}
            >
              {item.label}
            </a>
          ))}

          {/* 더보기 드롭다운 */}
          <div ref={moreRef} className="relative">
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className={`px-3.5 py-2.5 text-[15px] min-h-[44px] flex items-center gap-1 rounded-lg transition-colors border-none bg-transparent cursor-pointer ${
                moreIsActive
                  ? "font-semibold text-grey-900"
                  : "font-medium text-grey-700 hover:bg-grey-50 hover:text-grey-900"
              }`}
            >
              더보기
              <svg
                className={`w-3.5 h-3.5 transition-transform ${moreOpen ? "rotate-180" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {moreOpen && (
              <div className="absolute top-full right-0 mt-1 w-[160px] bg-white border border-grey-100 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] py-1 overflow-hidden">
                {moreItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`block px-4 py-2.5 text-[14px] no-underline transition-colors ${
                      isActive(item.href)
                        ? "font-semibold text-grey-900 bg-grey-50"
                        : "text-grey-700 hover:bg-grey-50"
                    }`}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* 로그인 상태에 따라 로그인 버튼 ↔ 내 계정 메뉴를 보여줌 */}
          <UserMenu />
        </div>

        {/* 모바일 햄버거 버튼 */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden w-10 h-10 grid place-items-center border-none bg-transparent cursor-pointer"
          aria-label="메뉴 열기"
        >
          <svg
            className="w-6 h-6 text-grey-900"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            {mobileOpen ? (
              <path d="M18 6L6 18M6 6l12 12" />
            ) : (
              <>
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* 모바일 메뉴 패널 */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-grey-100 px-5 py-4 space-y-1">
          {allItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`block px-4 py-3 text-[15px] rounded-lg no-underline transition-colors ${
                isActive(item.href)
                  ? "font-semibold text-grey-900 bg-grey-50"
                  : "text-grey-700 hover:bg-grey-50"
              }`}
            >
              {item.label}
            </a>
          ))}
          {/* 모바일용 로그인/로그아웃 영역 */}
          <UserMenu mobile />
        </div>
      )}
    </nav>
  );
}
