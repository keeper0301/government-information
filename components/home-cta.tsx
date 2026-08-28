// ============================================================
// HomeCTA — 페이지 끝 행동 유도 (내러티브 4단계의 "행동")
// ============================================================
// 토스 전략: 내러티브 흐름 마무리 = 사용자에게 다음 행동 명확히 제시.
// keepioo 의 핵심 행동 두 가지:
//   1. 추천 받기 (즉시 가치) → /policy 또는 Hero 의 추천카드
//   2. 알림 설정 (지속 가치) → /signup 회원가입 후 마감 임박 알림
//
// 비주얼: 큰 blue 그라디언트 배경 + 흰 글자 + 두 개 CTA 버튼.
// 첫 화면 옅은 blue 톤과 반전된 진한 blue 로 페이지 끝 임팩트 강조.
// ============================================================

import Link from "next/link";
import { buildBasicPricingHref } from "@/lib/pricing/cta-links";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense-review-mode";

export function HomeCTA() {
  const primaryHref = ADSENSE_REVIEW_MODE ? "/guides" : buildBasicPricingHref("home");
  const primaryLabel = ADSENSE_REVIEW_MODE
    ? "대표 가이드부터 확인하기 →"
    : "내 정책 마감 알림 시작하기 →";
  const secondaryHref = ADSENSE_REVIEW_MODE ? "/c/business" : "/guides";
  const secondaryLabel = ADSENSE_REVIEW_MODE ? "소상공인 가이드 보기" : "대표 가이드 보기";
  const titleLine1 = ADSENSE_REVIEW_MODE ? "마감 전 확인할 내용," : "조건 맞는 정책,";
  const titleLine2 = ADSENSE_REVIEW_MODE ? "가이드로 정리했어요" : "매주 이메일로 알려드려요";
  const description = ADSENSE_REVIEW_MODE
    ? "대표 가이드에서 대상·마감·신청 전 확인점을 먼저 살펴볼 수 있어요. 공식 공고를 확인할 때 놓치기 쉬운 기준도 함께 정리합니다."
    : "관심 조건을 등록해두면 새로 확인한 공고 중 맞는 항목을 정리해드려요. 마감 전에 살펴볼 내용도 함께 안내합니다.";

  return (
    <section className="max-w-content mx-auto px-6 lg:px-10 py-12 lg:py-20">
      <div
        className="relative overflow-hidden rounded-3xl px-7 lg:px-12 py-12 lg:py-16"
        style={{
          // 사이트 hero 와 동일 계열 옅은 블루. 강한 임팩트 대신
          // 자연스러운 톤으로 페이지 끝까지 사이트 분위기 유지.
          background: "linear-gradient(135deg, #E8F3FF 0%, #C9E2FF 100%)",
        }}
      >
        {/* 우상단 옅은 blob — 토스 풍 깊이감 (이제 흰색 → 더 옅은 블루) */}
        <div
          aria-hidden="true"
          className="absolute -top-20 -right-20 w-72 h-72 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(49,130,246,0.10) 0%, rgba(49,130,246,0) 70%)",
          }}
        />

        <div className="relative z-10 text-center">
          <p className="text-[14px] font-semibold text-blue-500 tracking-[0.18em] mb-4">
            START NOW
          </p>
          <h2 className="text-[36px] max-md:text-[26px] font-extrabold text-grey-900 leading-[1.2] tracking-[-1.5px] mb-4">
            {titleLine1}
            <br />
            {titleLine2}
          </h2>
          <p className="text-[16px] max-md:text-[14px] text-grey-700 leading-[1.65] mb-10 max-md:mb-7 max-w-[480px] mx-auto">
            {description}
          </p>

          {/* Basic SaaS 전환 CTA.
              AdSense 승인 전 review mode 에서는 pricing funnel 을 숨긴다.
              승인 후 NEXT_PUBLIC_ADSENSE_REVIEW_MODE=adsense-approved-live-ads 로 바꾸면
              ADSENSE_REVIEW_MODE=false 가 되어 기존 사이트 구조/pricing CTA 가 자동 복구된다. */}
          <div className="flex items-center justify-center gap-3 max-md:flex-col max-md:gap-2">
            <Link
              href={primaryHref}
              className="inline-flex items-center justify-center h-14 px-8 max-md:w-full max-md:h-12 max-md:px-6 rounded-2xl bg-blue-500 text-white text-[16px] font-bold no-underline hover:bg-blue-600 active:scale-[0.98] transition-all shadow-blue-glow"
            >
              {primaryLabel}
            </Link>
            <Link
              href={secondaryHref}
              className="inline-flex items-center justify-center h-14 px-8 max-md:w-full max-md:h-12 max-md:px-6 rounded-2xl bg-white text-blue-600 text-[16px] font-semibold no-underline hover:bg-blue-50 active:scale-[0.98] transition-all"
            >
              {secondaryLabel}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
