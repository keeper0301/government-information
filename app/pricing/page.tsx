// ============================================================
// /pricing — 요금제 안내 (3티어)
// ============================================================
// 서버 컴포넌트. 로그인 사용자는 현재 티어가 표시됨.
// "가입하기" 클릭 시:
//   비로그인 → /login?next=/checkout?tier=xxx 로 리다이렉트
//   로그인  → /checkout?tier=xxx 로 바로 이동
// ============================================================

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getUserTier, TIER_NAMES, TIER_PRICES, type Tier } from "@/lib/subscription";
import { GaPageTracker } from "@/components/ga-page-tracker";
import { parseRecommendedTier, type RecommendedTier } from "@/lib/pricing/recommended-tier";
import { getPricingConversionCopy, parsePricingSource, type PricingConversionCopy } from "@/lib/pricing/conversion-copy";
import { buildCheckoutQuery } from "@/lib/checkout/reassurance-copy";
import { reviewModeNoindexRobots } from "@/lib/adsense-review-mode";
import { CheckoutLink } from "./checkout-link";

export const metadata: Metadata = {
  title: "요금제 | 정책알리미",
  description: "사장님 정책 마감·자격 알림 SaaS. 무료 검색, 베이직 월 4,900원, 프로 월 9,900원.",
  // 요금제는 전환 보조 화면이지 공공정책 원문/가이드 콘텐츠가 아닙니다.
  // 재심사 샘플링에서 상업·얇은 페이지로 잡히지 않도록 색인 제외합니다.
  robots: reviewModeNoindexRobots(),
};

// 티어별 표시 정보
type PlanInfo = {
  tier: Tier;
  tagline: string;
  features: string[];
  // 메인 추천 티어 (강조 표시)
  highlight?: boolean;
};

const PLANS: PlanInfo[] = [
  {
    tier: "free",
    tagline: "내 지역·업종 정책을 먼저 둘러보는 단계",
    features: [
      "복지·대출 정책 전체 조회",
      "검색·필터 무제한",
      "맞춤 추천 1일 5회",
      "AI 정책 상담 1일 5회",
    ],
  },
  {
    // ★ 추천 티어 — 베이직 (자영업자 정책자금 코디 포지셔닝)
    tier: "basic",
    tagline: "내 사업자 조건에 맞는 정책을 놓치지 않기",
    highlight: true,
    features: [
      "무료 기능 전부",
      "사업자 프로필 기반 맞춤 정책 TOP 5",
      "🏪 내 가게 자격 확인 포인트 — 지역·업종·직원 기준 검토",
      "마감 7일 전 이메일 알림",
      "관심 정책 저장·추천 무제한",
    ],
  },
  {
    tier: "pro",
    tagline: "알림톡/SMS와 신청 준비까지 필요한 사장님",
    features: [
      "베이직 기능 전부",
      "카카오 알림톡 (자격 매칭 정책만)",
      "AI 신청서 초안 작성 보조",
      "마감 7일 전 SMS 알림",
      "AI 정책 상담 제한 완화",
    ],
  },
];

export default async function PricingPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const recommendedTier = parseRecommendedTier(resolvedSearchParams);
  const pricingSource = parsePricingSource(resolvedSearchParams);
  const conversionCopy = getPricingConversionCopy({
    source: pricingSource,
    recommendedTier,
  });
  // 로그인 상태 + 현재 티어 조회 (없으면 free)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const currentTier: Tier = user ? await getUserTier(user.id) : "free";

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      {/* GA4 pricing_viewed 이벤트 (전환 퍼널 분석) */}
      <GaPageTracker
        eventName="pricing_viewed"
        params={{
          source: pricingSource ?? "direct",
          recommended_tier: recommendedTier ?? "none",
          pricing_variant: conversionCopy.variant,
        }}
      />
      <div className="max-w-[1100px] mx-auto px-5">
        {/* 헤더 */}
        <div className="text-center mb-10 md:mb-14">
          <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.18em] text-blue-600">
            사장님 정책 놓침 방지 SaaS
          </p>
          <h1 className="text-[28px] md:text-[36px] font-extrabold tracking-[-0.6px] text-grey-900 mb-3">
            {conversionCopy.heading}
          </h1>
          <p className="text-[15px] md:text-[17px] text-grey-700 leading-[1.6]">
            {conversionCopy.subheading}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2 text-[13px] font-semibold text-grey-700">
            <span className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-grey-100">사업자 프로필 기반 추천</span>
            <span className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-grey-100">마감 7일 전 알림</span>
            <span className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-grey-100">공식 원문 확인 링크</span>
          </div>
        </div>

        {/* 3개 카드 가로 배치 (모바일은 세로 스택) */}
        <div className="grid gap-5 md:grid-cols-3 max-w-[940px] mx-auto">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.tier}
              plan={plan}
              currentTier={currentTier}
              isLoggedIn={Boolean(user)}
              recommendedTier={recommendedTier}
              conversionCopy={conversionCopy}
            />
          ))}
        </div>

        {/* 안내 문구 */}
        <div className="max-w-[720px] mx-auto mt-12 text-center space-y-2">
          <p className="text-[14px] font-semibold text-grey-800">
            키피오는 신청 대행이 아니라, 사장님이 놓치기 쉬운 정책을 먼저 찾고 확인하도록 돕는 알림 서비스입니다.
          </p>
          <p className="text-[13px] text-grey-600">
            결제는 토스페이먼츠로 안전하게 처리됩니다. 카드 정보는 토스에만 저장돼요.
          </p>
          <p className="text-[13px] text-grey-600">
            언제든 <a href="/mypage/billing" className="text-blue-500 underline">내 구독</a>에서 카드를 변경하거나 해지할 수 있습니다.
          </p>
        </div>
      </div>
    </main>
  );
}

// ============================================================
// 단일 요금제 카드
// ============================================================
function PlanCard({ plan, currentTier, isLoggedIn, recommendedTier, conversionCopy }: {
  plan: PlanInfo;
  currentTier: Tier;
  isLoggedIn: boolean;
  recommendedTier: RecommendedTier;
  conversionCopy: PricingConversionCopy;
}) {
  const isCurrent = currentTier === plan.tier;
  const price = plan.tier === "free" ? 0 : TIER_PRICES[plan.tier];
  const isRecommended = recommendedTier === plan.tier;
  const isHighlighted = Boolean(plan.highlight) || isRecommended;

  // 카드 전체 스타일: 추천 티어는 더 진한 그림자 + 강조 테두리
  const cardClass = isHighlighted
    ? plan.tier === "pro"
      ? "bg-white rounded-2xl border-2 border-amber-400 shadow-[0_8px_30px_rgba(245,158,11,0.18)] p-7 relative"
      : "bg-white rounded-2xl border-2 border-blue-500 shadow-[0_8px_30px_rgba(49,130,246,0.15)] p-7 relative"
    : "bg-white rounded-2xl border border-grey-100 shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-7";
  const badgeClass = isRecommended && plan.tier === "pro"
    ? "bg-amber-500 text-white"
    : "bg-blue-500 text-white";

  return (
    <div className={cardClass}>
      {/* 추천/인기 뱃지 */}
      {isHighlighted && (
        <div className={`absolute -top-3 left-1/2 -translate-x-1/2 text-[12px] font-bold px-3 py-1 rounded-full ${badgeClass}`}>
          {isRecommended ? "추천 플랜" : "가장 인기"}
        </div>
      )}

      {/* 티어명 + 카피 */}
      <div className="mb-5">
        <h3 className="text-[20px] font-extrabold text-grey-900 mb-1">
          {TIER_NAMES[plan.tier]}
        </h3>
        <p className="text-[13px] text-grey-600">{plan.tagline}</p>
        {(plan.tier === "basic" || plan.tier === "pro") && conversionCopy.planNudgeByTier[plan.tier] && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-semibold leading-[1.5] text-amber-900">
            {conversionCopy.planNudgeByTier[plan.tier]}
          </p>
        )}
      </div>

      {/* 가격 */}
      <div className="mb-6">
        {price === 0 ? (
          <div className="text-[28px] font-extrabold text-grey-900">무료</div>
        ) : (
          <div className="flex items-baseline gap-1">
            <span className="text-[28px] font-extrabold text-grey-900">
              {price.toLocaleString()}원
            </span>
            <span className="text-[14px] text-grey-600">/월</span>
          </div>
        )}
      </div>

      {/* 기능 목록 */}
      <ul className="space-y-2.5 mb-6 min-h-[180px]">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-[15px] text-grey-800">
            <CheckIcon />
            <span className="leading-[1.55]">{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA 버튼 */}
      <CtaButton
        plan={plan}
        isCurrent={isCurrent}
        isLoggedIn={isLoggedIn}
        conversionCopy={conversionCopy}
      />
    </div>
  );
}

// CTA 버튼: 현재 플랜 / 가입하기 / 무료 시작 분기
function CtaButton({ plan, isCurrent, isLoggedIn, conversionCopy }: {
  plan: PlanInfo;
  isCurrent: boolean;
  isLoggedIn: boolean;
  conversionCopy: PricingConversionCopy;
}) {
  const baseClass = "block w-full min-h-[52px] flex items-center justify-center text-[15px] font-bold rounded-xl no-underline transition-colors";

  // 이미 이 플랜을 쓰고 있는 경우: 비활성 표시
  if (isCurrent) {
    return (
      <div className={`${baseClass} bg-grey-100 text-grey-600 cursor-default`}>
        현재 플랜
      </div>
    );
  }

  // 무료 플랜: 가입 유도 또는 "지금 무료로 사용 중"
  if (plan.tier === "free") {
    if (isLoggedIn) {
      return <div className={`${baseClass} bg-grey-100 text-grey-600 cursor-default`}>무료로 이용 중</div>;
    }
    return (
      <a
        href="/login"
        data-ga-event="cta_clicked"
        data-ga-label="무료로 시작하기"
        data-ga-location="pricing_free_plan"
        data-ga-params='{"target":"signup","plan":"free"}'
        className={`${baseClass} bg-grey-100 text-grey-800 hover:bg-grey-200`}
      >
        무료로 시작하기
      </a>
    );
  }

  // 유료 플랜: 결제 페이지로 이동 (비로그인이면 로그인 후 자동 복귀)
  const next = buildCheckoutQuery({
    tier: plan.tier,
    source: conversionCopy.source,
    recommendedTier: conversionCopy.recommendedTier,
    pricingVariant: conversionCopy.variant,
  });
  const href = isLoggedIn ? next : `/login?next=${encodeURIComponent(next)}`;
  const ctaLabel = (plan.tier === "basic" || plan.tier === "pro")
    ? conversionCopy.ctaLabelByTier[plan.tier] ?? "7일 무료로 시작하기"
    : "7일 무료로 시작하기";
  const buttonStyle = conversionCopy.recommendedTier === "pro" && plan.tier === "pro"
    ? "bg-amber-500 text-white hover:bg-amber-600 shadow-[0_2px_8px_rgba(245,158,11,0.25)]"
    : plan.highlight
      ? "bg-blue-500 text-white hover:bg-blue-600 shadow-[0_2px_8px_rgba(49,130,246,0.25)]"
      : "bg-grey-900 text-white hover:bg-grey-800";

  return (
    <CheckoutLink
      href={href}
      tier={plan.tier}
      isLoggedIn={isLoggedIn}
      pricingVariant={conversionCopy.variant}
      source={conversionCopy.source}
      recommendedTier={conversionCopy.recommendedTier}
      className={`${baseClass} ${buttonStyle}`}
    >
      {ctaLabel}
    </CheckoutLink>
  );
}

// 체크 아이콘
function CheckIcon() {
  return (
    <svg className="w-[18px] h-[18px] text-blue-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
