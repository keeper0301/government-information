// components/cohort-cta-banner.tsx
// ============================================================
// /c/[category] 카테고리 hub 의 가입 유도 CTA banner.
// ============================================================
// 광고 도달 트래픽이 cohort hub 에 떨어지는데 명시 가입 CTA 부재로
// conversion 약한 사고 (2026-05-06 진단 — 가입자 5명 / 24h 0건).
//
// 두 variant:
//   - "primary": Hero 직후 강한 CTA (큰 banner)
//   - "secondary": 마감 임박 정책 다음 mid-page (가볍고 단정한 카드)
//
// 로그인 사용자에게도 노출 — 신뢰 신호 + 회유 효과. 가입자에겐 /quiz 가
// 프로필 입력 진입점이라 의미 보존.
// ============================================================

import Link from "next/link";

interface Props {
  shortLabel: string;
  emoji: string;
  variant?: "primary" | "secondary";
}

export function CohortCtaBanner({
  shortLabel,
  emoji,
  variant = "primary",
}: Props) {
  if (variant === "secondary") {
    return (
      <div className="rounded-2xl bg-blue-50 border border-blue-200 p-5 my-8 text-center">
        <p className="text-[15px] font-semibold text-grey-900">
          이 {shortLabel} 정책 마감 놓치지 마세요
        </p>
        <p className="mt-1 text-[13px] text-grey-700">
          가입하면 마감 임박 정책을 이메일·알림톡으로 자동 안내해드려요
        </p>
        <Link
          href="/quiz"
          className="mt-3 inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded-lg text-[14px] no-underline"
        >
          무료로 시작 →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-gradient-to-r from-emerald-50 to-emerald-100 border border-emerald-200 p-6 mb-10">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6">
        <div className="flex-1">
          <p className="text-[18px] font-bold text-grey-900 leading-tight">
            <span className="mr-2" aria-hidden="true">
              {emoji}
            </span>
            {shortLabel} 정책 마감 알림 무료로 받기
          </p>
          <p className="mt-2 text-[14px] text-grey-700 leading-[1.6]">
            30초 진단으로 내 조건에 맞는 정책만 골라서 이메일·알림톡 자동 알림.
            <br className="hidden md:inline" />
            매일 갱신되는 보조금24·복지로 데이터 큐레이션.
          </p>
        </div>
        <Link
          href="/quiz"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-3 rounded-xl text-[15px] whitespace-nowrap no-underline"
        >
          1분 진단부터 시작 →
        </Link>
      </div>
    </div>
  );
}
