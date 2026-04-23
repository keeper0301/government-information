"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { UserMenu } from "./user-menu";

// 전체 메뉴 항목 (더보기 드롭다운 없이 데스크톱 한 줄에 모두 나열)
const items = [
  { label: "복지정보", href: "/welfare" },
  { label: "대출정보", href: "/loan" },
  { label: "맞춤추천", href: "/recommend" },
  { label: "인기정책", href: "/popular" },
  { label: "정책가이드", href: "/blog" },
  { label: "달력", href: "/calendar" },
  { label: "AI상담", href: "/consult" },
  { label: "알림센터", href: "/alerts" },
  { label: "요금제", href: "/pricing" },
];

export function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // 페이지 이동 시 모바일 메뉴 닫기
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // 현재 경로와 메뉴 링크 비교
  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

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
          {/* xl 이상에서만 한글 부텍스트 노출 — 메뉴 9개 나열 공간 확보 */}
          <span
            className="hidden xl:inline-block text-grey-900"
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

        {/* 데스크톱 메뉴 — lg (1024px) 부터 9개 항목 전부 나열 (md~lg 구간은 햄버거) */}
        <div className="hidden lg:flex items-center gap-0.5">
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`px-3 py-2.5 text-[15px] min-h-[44px] flex items-center rounded-lg transition-colors no-underline ${
                isActive(item.href)
                  ? "font-semibold text-grey-900"
                  : "font-medium text-grey-700 hover:bg-grey-50 hover:text-grey-900"
              }`}
            >
              {item.label}
            </a>
          ))}

          {/* 로그인 상태에 따라 로그인 버튼 ↔ 내 계정 메뉴를 보여줌 */}
          <UserMenu />
        </div>

        {/* 모바일·태블릿 햄버거 버튼 (lg 미만) */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="lg:hidden w-10 h-10 grid place-items-center border-none bg-transparent cursor-pointer"
          aria-label={mobileOpen ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
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

      {/* 모바일·태블릿 메뉴 패널 (lg 미만) */}
      {mobileOpen && (
        <div id="mobile-menu" className="lg:hidden bg-white border-t border-grey-100 px-5 py-4 space-y-1">
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
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
