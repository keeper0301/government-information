"use client";

// ============================================================
// NotificationBell — 헤더 K 아이콘 옆 알림 종
// ============================================================
// /alerts 로 이동하는 단축 아이콘. layout.tsx 에서 server-side 로
// 활성 알림 개수를 조회해 prop 으로 전달받아 배지로 표시한다.
// 비로그인 사용자에게는 렌더하지 않는다 (메뉴를 더 깔끔하게 유지).
// ============================================================

import Link from "next/link";

type Props = {
  loggedIn: boolean;
  count: number; // 활성 알림(alarm_subscriptions.is_active=true) 개수
};

export function NotificationBell({ loggedIn, count }: Props) {
  // 비로그인이면 자리 자체를 비워서 헤더가 깔끔
  if (!loggedIn) return null;

  const label =
    count > 0 ? `알림센터 (활성 알림 ${count}개)` : "알림센터";

  return (
    <Link
      href="/alerts"
      aria-label={label}
      title={label}
      className="relative w-11 h-11 grid place-items-center text-grey-700 hover:text-grey-900 transition-colors no-underline"
    >
      {/* 종 아이콘 — 22x22, 1.6 stroke (헤더 다른 SVG 와 동일 시각 무게) */}
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>

      {/* 활성 알림 개수 배지 — 1 이상일 때만. 99 초과는 99+ 로 압축 */}
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] px-1 grid place-items-center rounded-full text-white text-[10px] font-bold leading-none"
          style={{ background: "#8A2A2A" }}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
