"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "./user-menu";

// 전체 메뉴 항목 (더보기 드롭다운 없이 데스크톱 한 줄에 모두 나열)
const items = [
  { label: "복지정보", href: "/welfare" },
  { label: "대출정보", href: "/loan" },
  { label: "맞춤추천", href: "/recommend" },
  { label: "인기정책", href: "/popular" },
  { label: "정책소식", href: "/news" },
  { label: "정책가이드", href: "/blog" },
  { label: "달력", href: "/calendar" },
  { label: "AI상담", href: "/consult" },
  { label: "알림센터", href: "/alerts" },
  { label: "요금제", href: "/pricing" },
  { label: "도움말", href: "/help" },
];

// isAdmin: layout.tsx 의 RootLayout 이 서버에서 isAdminUser() 로 판정해 prop 으로 전달.
// 어드민 한정 메뉴 노출 여부 결정. UI 노출용일 뿐 실제 권한은 /admin 서버 가드로 재검증.
type NavProps = {
  isAdmin?: boolean;
};

export function Nav({ isAdmin = false }: NavProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // 현재 경로와 메뉴 링크 비교
  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-[20px] backdrop-saturate-[180%] border-b border-grey-100">
      <div className="max-w-content mx-auto px-10 h-[58px] flex items-center justify-between max-md:px-5">
        {/* 로고 — Editorial Masthead (이탤릭 세리프 워드마크 + 버건디 dot) */}
        <Link
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
          {/* 2xl 이상에서만 한글 부텍스트 노출 — 1024~1280 구간에 11개 메뉴
              나열 공간 확보 (기존 xl 이상 노출은 1280~1536 구간 가독성 침해) */}
          <span
            className="hidden 2xl:inline-block text-grey-900"
            style={{
              fontFamily: "'Nanum Myeongjo', 'Noto Serif KR', serif",
              fontSize: "13px", fontWeight: 700, letterSpacing: "1.5px",
              borderLeft: "0.5px solid rgba(14,11,8,0.35)",
              paddingLeft: "10px", marginLeft: "2px",
            }}
          >
            정책알리미
          </span>
        </Link>

        {/* 데스크톱 메뉴 — lg (1024px) 부터 11개 항목 전부 나열 (md~lg 구간은 햄버거).
            디자인 원칙:
            · 14px (데스크톱 nav 표준) · font-medium · grey-700
            · hover 는 배경 칩 대신 글자색만 진해짐 → 11개가 모여 있어도 덜 산만
            · active 는 굵기 + 버건디 2px hairline (로고 dot 과 브랜드 연결) */}
        <div className="hidden lg:flex items-center gap-1">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative px-2.5 xl:px-3 py-2.5 text-[14px] min-h-[44px] flex items-center transition-colors no-underline ${
                  active
                    ? "font-semibold text-grey-900"
                    : "font-medium text-grey-700 hover:text-grey-900"
                }`}
              >
                {item.label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-2.5 right-2.5 xl:left-3 xl:right-3 bottom-1.5 h-[2px] rounded-full"
                    style={{ background: "#8A2A2A" }}
                  />
                )}
              </a>
            );
          })}

          {/* 로그인 상태에 따라 로그인 버튼 ↔ 내 계정 메뉴를 보여줌 */}
          <UserMenu isAdmin={isAdmin} />
        </div>

        {/* 모바일·태블릿 햄버거 버튼 (lg 미만) */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="lg:hidden w-11 h-11 grid place-items-center border-none bg-transparent cursor-pointer"
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

      {/* 모바일·태블릿 메뉴 패널 (lg 미만) — 세로 나열은 공간 여유 있으므로
          데스크톱과 달리 rounded bg 유지. active 표시는 버건디 좌측 bar 로
          데스크톱 밑줄과 시각 일관성. */}
      {mobileOpen && (
        <div id="mobile-menu" className="lg:hidden bg-white border-t border-grey-100 px-5 py-4 space-y-1">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`relative block pl-5 pr-4 py-3 text-[15px] rounded-lg no-underline transition-colors ${
                  active
                    ? "font-semibold text-grey-900 bg-grey-50"
                    : "text-grey-700 hover:bg-grey-50"
                }`}
              >
                {item.label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                    style={{ background: "#8A2A2A" }}
                  />
                )}
              </a>
            );
          })}
          {/* 모바일용 로그인/로그아웃 영역 — 선택 시 햄버거 닫기 */}
          <UserMenu mobile isAdmin={isAdmin} onNavigate={() => setMobileOpen(false)} />
        </div>
      )}
    </nav>
  );
}
