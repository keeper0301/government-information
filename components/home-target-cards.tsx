// ============================================================
// 홈 대상별 빠른 진입 카드 6종 (Target Grid)
// ============================================================
// 외부 LLM 5개 평가 공통 지적: "첫 화면에 대상별 빠른 진입 카드를 두면
// 사용자가 자기 상황에 맞는 정책을 즉시 탐색 가능, 체감 UX 큰 향상".
//
// 대상 6종 + 매핑:
//   - 청년 → /welfare?target=청년 (target 컬럼 ilike)
//   - 신혼부부 → /eligibility/married (household_target_tags)
//   - 부모·육아 → /welfare?target=육아 (target 컬럼 ilike)
//   - 소상공인 → /loan (loan 페이지 자체가 소상공인 대상)
//   - 저소득 → /eligibility/low-income (income_target_level)
//   - 1인가구 → /eligibility/single (household_target_tags)
//
// 각 카드는 BigKpi 처럼 큰 아이콘 + 라벨. 클릭 시 즉시 해당 영역.
// GA4 이벤트: HOME_TARGET_CARD_CLICKED { label } — 어떤 카드가 인기인지 측정.
// ============================================================

"use client";

import Link from "next/link";
import { trackEvent, EVENTS } from "@/lib/analytics";
import {
  Sparkles,
  Heart,
  Baby,
  Store,
  HandCoins,
  User,
} from "lucide-react";

const TARGETS: {
  href: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  // 카드 색상 — Tailwind palette 친화적인 hex 직접 (theme 토큰 외 일관성)
  bg: string;
  fg: string;
}[] = [
  {
    // age=청년 (age_tags ARRAY contains) — 2026-04-28 fix: target ilike 24건
    // → age_tags contains 정확 매칭 (welfare/page.tsx 의 ALLOWED_AGES 처리).
    href: "/welfare?age=%EC%B2%AD%EB%85%84",
    label: "청년",
    desc: "20·30대 정책",
    icon: Sparkles,
    bg: "bg-blue-50",
    fg: "text-blue-600",
  },
  {
    href: "/eligibility/married",
    label: "신혼부부",
    desc: "결혼·전세 지원",
    icon: Heart,
    bg: "bg-pink-50",
    fg: "text-pink-600",
  },
  {
    // category=양육 (DB 정확 매칭 1,053건) — 2026-04-28 fix: target=육아 0건 사고.
    // welfare 의 category 컬럼이 옛 분류 (생계·의료·양육·교육·취업·주거·문화·창업).
    href: "/welfare?category=%EC%96%91%EC%9C%A1",
    label: "부모·육아",
    desc: "출산·양육비",
    icon: Baby,
    bg: "bg-amber-50",
    fg: "text-amber-600",
  },
  {
    href: "/loan",
    label: "소상공인",
    desc: "정책자금·대출",
    icon: Store,
    bg: "bg-emerald-50",
    fg: "text-emerald-600",
  },
  {
    href: "/eligibility/low-income",
    label: "저소득",
    desc: "기초생활·차상위",
    icon: HandCoins,
    bg: "bg-violet-50",
    fg: "text-violet-600",
  },
  {
    href: "/eligibility/single",
    label: "1인가구",
    desc: "주거·생활 지원",
    icon: User,
    bg: "bg-cyan-50",
    fg: "text-cyan-600",
  },
];

export function HomeTargetCards() {
  return (
    <section aria-labelledby="target-cards-title">
      <h2
        id="target-cards-title"
        className="text-[20px] md:text-[24px] font-extrabold text-grey-900 tracking-[-0.5px] mb-2"
      >
        내 상황에 맞는 정책 바로가기
      </h2>
      <p className="text-[14px] text-grey-600 mb-6">
        대상을 누르면 해당 정책이 모인 페이지로 바로 이동해요.
      </p>
      {/* 사이드 배너 row 안 grid: 모바일 3 cols (두 줄), 데스크톱도 3 cols (두 줄)
          → 좌측 cell 너비 한정에서 카드 너비 충분히 확보. 6 cols 한 줄은
          HomePopularPicks 사이드 배너 row 안에서 카드 너무 좁아짐. */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {TARGETS.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.label}
              href={t.href}
              onClick={() => trackEvent(EVENTS.HOME_TARGET_CARD_CLICKED, { label: t.label })}
              className="group flex flex-col items-center gap-2 rounded-2xl bg-white border border-grey-200 p-4 md:p-5 no-underline hover:border-blue-300 hover:shadow-[0_4px_12px_rgba(49,130,246,0.08)] transition-all"
            >
              <div
                className={`flex items-center justify-center w-12 h-12 rounded-full ${t.bg} ${t.fg} group-hover:scale-110 transition-transform`}
                aria-hidden="true"
              >
                <Icon className="w-6 h-6" />
              </div>
              <div className="text-center">
                <div className="text-[14px] md:text-[15px] font-bold text-grey-900 tracking-[-0.2px]">
                  {t.label}
                </div>
                <div className="text-[12px] text-grey-600 mt-0.5 leading-[1.4]">
                  {t.desc}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
