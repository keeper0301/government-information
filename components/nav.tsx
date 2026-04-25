"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "./notification-bell";

// ============================================================
// 헤더 메뉴 — 11개 → 5개로 축소
// ============================================================
// "정책" 메뉴는 /policy 둘러보기 허브로 진입한 뒤 4개 탭(맞춤추천/복지/
// 대출/인기) 으로 분기. 모바일 햄버거에서는 정책 하위 4개를 들여쓰기로 펼쳐
// 한 손가락 동선을 줄였다.
// 알림센터·정책가이드·도움말·이용약관 은 헤더에서 빼고 모바일 햄버거 하단
// "기타 메뉴" 영역과 푸터로만 노출 (헤더 가독성 우선).
// ============================================================
const items = [
  {
    label: "정책",
    href: "/policy",
    // 모바일 햄버거에서만 펼쳐 보여주는 하위 탭. 데스크톱은 평탄.
    children: [
      { label: "맞춤추천", href: "/policy" },
      { label: "복지정보", href: "/welfare" },
      { label: "대출정보", href: "/loan" },
      { label: "인기정책", href: "/popular" },
    ],
  },
  { label: "소식", href: "/news" },
  { label: "달력", href: "/calendar" },
  { label: "AI상담", href: "/consult" },
  { label: "요금제", href: "/pricing" },
] as const;

// 모바일 햄버거 하단 "기타 메뉴" — 헤더에서 빠진 항목들의 마지막 진입점
const mobileExtraItems = [
  { label: "알림센터", href: "/alerts" },
  { label: "정책가이드", href: "/blog" },
  { label: "도움말", href: "/help" },
  { label: "이용약관", href: "/terms" },
] as const;

type NavProps = {
  // 어드민 메뉴 노출 여부 (UI 용 — 실권한은 /admin 서버 가드)
  isAdmin?: boolean;
  // 로그인 여부 (NotificationBell 노출 판정)
  loggedIn?: boolean;
  // 활성 알림 개수 (종 아이콘 배지)
  alarmCount?: number;
};

export function Nav({
  isAdmin = false,
  loggedIn = false,
  alarmCount = 0,
}: NavProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-[20px] backdrop-saturate-[180%] border-b border-grey-100">
      <div className="max-w-content mx-auto px-10 h-[58px] flex items-center justify-between max-md:px-5">
        {/* 로고 — 토스 풍 Pretendard 단어 마스트헤드.
            "keepi" + 강조 "oo" (마지막 두 글자만 blue-500) — 사이트의 친근한
            큐레이션·"keep" 의미를 살리면서 토스 가이드(단일 sans + 단어 강조)
            패턴 따름. 부텍스트는 lg+ 에서만 옅은 grey 로 부가 표시. */}
        <Link
          href="/"
          aria-label="keepioo 정책알리미 홈으로"
          className="flex items-baseline gap-2.5 no-underline"
        >
          <span className="font-extrabold text-[26px] tracking-[-0.04em] leading-none text-grey-900">
            keepi<span className="text-blue-500">oo</span>
          </span>
          <span className="hidden lg:inline-block text-[13px] font-semibold text-grey-500 tracking-[-0.01em] pl-2.5 border-l border-grey-200">
            정책알리미
          </span>
        </Link>

        {/* 데스크톱 메뉴 — lg(1024)부터 5개 항목 + 종 아이콘 + 계정.
            메뉴 수가 절반 이하로 줄어 라벨 사이 padding 을 더 넉넉히 할 수 있다. */}
        <div className="hidden lg:flex items-center gap-1">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative px-3 xl:px-4 py-2.5 text-[14px] min-h-[44px] flex items-center transition-colors no-underline ${
                  active
                    ? "font-semibold text-grey-900"
                    : "font-medium text-grey-700 hover:text-grey-900"
                }`}
              >
                {item.label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-3 right-3 xl:left-4 xl:right-4 bottom-1.5 h-[2px] rounded-full bg-blue-500"
                  />
                )}
              </Link>
            );
          })}

          {/* 알림 종 아이콘 — UserMenu 왼쪽 */}
          <NotificationBell loggedIn={loggedIn} count={alarmCount} />

          {/* 로그인/계정 메뉴 */}
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

      {/* 모바일·태블릿 메뉴 패널 (lg 미만)
          - 5개 메인 메뉴 (정책은 하위 4개 탭 들여쓰기로 함께 노출 — 한 손가락 동선)
          - 그 아래 알림센터·정책가이드·도움말·이용약관 작은 글씨 묶음
          - 마지막에 로그인/내계정 영역 */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          className="lg:hidden bg-white border-t border-grey-100 px-5 py-4 space-y-1"
        >
          {items.map((item) => (
            <MobileMenuItem
              key={item.href}
              item={item}
              isActive={isActive}
              onNavigate={() => setMobileOpen(false)}
            />
          ))}

          {/* 기타 메뉴 — 헤더에서 뺀 항목들의 마지막 진입점.
              구분선 + 작은 글씨로 메인 메뉴와 시각 분리 */}
          <div className="pt-3 mt-3 border-t border-grey-100">
            <div className="px-5 pb-1.5 text-[11px] font-semibold tracking-[1px] text-grey-500 uppercase">
              기타
            </div>
            {mobileExtraItems.map((extra) => (
              <a
                key={extra.href}
                href={extra.href}
                onClick={() => setMobileOpen(false)}
                className="block pl-5 pr-4 py-2.5 text-[13px] rounded-lg no-underline text-grey-600 hover:bg-grey-50 transition-colors"
              >
                {extra.label}
              </a>
            ))}
          </div>

          {/* 로그인/내계정 영역 */}
          <UserMenu mobile isAdmin={isAdmin} onNavigate={() => setMobileOpen(false)} />
        </div>
      )}
    </nav>
  );
}

// ============================================================
// MobileMenuItem — 모바일 햄버거 한 줄
// ============================================================
// 일반 항목은 단순 a 태그, "정책" 처럼 children 이 있으면 그 아래에
// 하위 4개 탭을 들여쓰기로 함께 렌더한다 (탭 전환을 위해 굳이 /policy
// 진입할 필요 없게).
// ============================================================
type MenuItem = (typeof items)[number];

function MobileMenuItem({
  item,
  isActive,
  onNavigate,
}: {
  item: MenuItem;
  isActive: (href: string) => boolean;
  onNavigate: () => void;
}) {
  const active = isActive(item.href);
  const hasChildren = "children" in item && item.children.length > 0;

  return (
    <div>
      <a
        href={item.href}
        onClick={onNavigate}
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
            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-blue-500"
          />
        )}
      </a>

      {/* 하위 탭 (정책 메뉴 전용) — 들여쓰기 + 작은 글씨 */}
      {hasChildren && (
        <div className="ml-4 pl-4 border-l border-grey-100 space-y-0.5">
          {item.children.map((child) => (
            <a
              key={child.href + child.label}
              href={child.href}
              onClick={onNavigate}
              className="block pl-3 pr-4 py-2 text-[13px] text-grey-600 hover:text-grey-900 hover:bg-grey-50 rounded-lg no-underline transition-colors"
            >
              {child.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
