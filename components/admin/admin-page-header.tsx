// components/admin/admin-page-header.tsx
// ============================================================
// 어드민 페이지 표준 헤더 슬롯 — kicker · title · description
// ============================================================
// 각 admin sub page 가 점진 마이그레이션 시 사용. 1차 plan 에서는
// 메인 대시보드 (/admin) 만 도입. 후속 plan 에서 다른 페이지로 확장.
//
// 2026-04-29 description prop 을 string | ReactNode 로 확장:
//  · cron-trigger 처럼 줄바꿈·강조 (<br>·<strong>) 가 있는 본문은 ReactNode 로
//    원본 시각 보존. plain string 은 자동으로 <p> 한 줄에 렌더 (기존 동작).
// ============================================================

import type { ReactNode } from "react";

type Props = {
  kicker?: string;
  title: string;
  description?: string | ReactNode;
};

export function AdminPageHeader({
  kicker = "ADMIN",
  title,
  description,
}: Props) {
  // string 이면 단일 <p> 로 감싸 가독성 보존, ReactNode (JSX) 면 그대로 렌더
  const isString = typeof description === "string";
  return (
    <div className="mb-8">
      <p className="text-xs text-blue-500 font-bold tracking-[0.18em] mb-2 uppercase">
        {kicker}
      </p>
      {/* H1 사이즈는 표준 토큰 예외 보존 — 18 sub page 의 KPI/카운터 (text-2xl) 와
          위계 충돌 방지. Tailwind 표준에 26px/32px 가 없어 arbitrary 유지. */}
      <h1 className="text-[26px] md:text-[32px] font-extrabold tracking-[-0.04em] text-grey-900 mb-2">
        {title}
      </h1>
      {description && (
        isString ? (
          <p className="text-sm text-grey-700 leading-[1.6] max-w-2xl">
            {description}
          </p>
        ) : (
          <div className="text-sm text-grey-700 leading-[1.6] max-w-2xl">
            {description}
          </div>
        )
      )}
    </div>
  );
}
