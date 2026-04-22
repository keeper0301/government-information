// ============================================================
// /checkout?tier=basic|pro — 결제 정보 입력 (카드 등록)
// ============================================================
// 서버 컴포넌트:
//   1) 비로그인 → /login?next=/checkout?tier=xxx 로 리다이렉트
//   2) 잘못된 tier → /pricing 으로 리다이렉트
//   3) 이미 활성 유료 구독자 → /mypage/billing 으로 리다이렉트
// 클라이언트:
//   토스 SDK 호출 (CheckoutForm 컴포넌트)
// ============================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TIER_NAMES, TIER_PRICES, getUserTier, type Tier } from "@/lib/subscription";
import { CheckoutForm } from "./checkout-form";

type SearchParams = Promise<{ tier?: string }>;

export default async function CheckoutPage({ searchParams }: { searchParams: SearchParams }) {
  const { tier } = await searchParams;

  // 1) tier 검증 — basic|pro 만 결제 가능, free 는 결제 자체가 없음
  if (tier !== "basic" && tier !== "pro") {
    redirect("/pricing");
  }
  const validTier: Exclude<Tier, "free"> = tier;

  // 2) 로그인 체크 — 비로그인이면 next 파라미터 붙여 로그인 페이지로
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const next = encodeURIComponent(`/checkout?tier=${validTier}`);
    redirect(`/login?next=${next}`);
  }

  // 3) 이미 같은 티어 이상 구독자면 내 구독 페이지로
  const currentTier = await getUserTier(user.id);
  if (currentTier === validTier || (currentTier === "pro" && validTier === "basic")) {
    redirect("/mypage/billing?already=1");
  }

  // 4) "결제 의도" 를 DB 에 미리 기록 (tier 변조 방지)
  // success 페이지는 URL 의 tier 가 아니라 이 행의 tier 를 사용함.
  // 결제 미완료 상태로 두기 위해 status='pending', billing_key 는 비움.
  // 같은 사용자가 여러 번 시도하면 마지막 의도로 덮어써짐 (UNIQUE on user_id).
  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .upsert({
      user_id: user.id,
      tier: validTier,
      status: "pending",
      // 기존 billing_key/카드정보 가 있으면 덮어쓰지 않도록 null 명시 X
      // (해지된 사용자의 재가입 시 기존 카드 정보 보존)
    }, { onConflict: "user_id", ignoreDuplicates: false });

  // 토스 클라이언트 키는 NEXT_PUBLIC_ 으로 노출 가능 (브라우저에서 사용)
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  if (!clientKey) {
    return (
      <main className="min-h-screen pt-[80px] pb-20 px-5 max-w-[600px] mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 mt-10">
          <h2 className="text-[18px] font-bold text-red-700 mb-2">결제 시스템 설정 누락</h2>
          <p className="text-[14px] text-red-700">
            관리자에게 문의해주세요. (NEXT_PUBLIC_TOSS_CLIENT_KEY 환경변수가 필요합니다)
          </p>
        </div>
      </main>
    );
  }

  const price = TIER_PRICES[validTier];
  const tierName = TIER_NAMES[validTier];

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[560px] mx-auto px-5">
        {/* 헤더 */}
        <div className="mb-6">
          <a href="/pricing" className="text-[13px] text-grey-500 hover:text-grey-700 no-underline">
            ← 요금제 다시 보기
          </a>
          <h1 className="text-[24px] md:text-[28px] font-extrabold text-grey-900 mt-3 tracking-[-0.5px]">
            결제 정보를 등록해주세요
          </h1>
          <p className="text-[14px] text-grey-700 mt-2 leading-[1.6]">
            카드를 등록해두면 7일 무료체험이 시작돼요. 체험 기간 동안 언제든 해지 가능합니다.
          </p>
        </div>

        {/* 결제 요약 카드 */}
        <div className="bg-white rounded-2xl border border-grey-100 shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-6 mb-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="text-[13px] text-grey-500 mb-1">선택한 요금제</div>
              <div className="text-[20px] font-extrabold text-grey-900">{tierName}</div>
            </div>
            <div className="text-right">
              <div className="text-[13px] text-grey-500 mb-1">월 결제</div>
              <div className="text-[20px] font-extrabold text-grey-900">
                {price.toLocaleString()}원
              </div>
            </div>
          </div>

          {/* 일정 안내 */}
          <div className="border-t border-grey-100 pt-4 space-y-2 text-[13px] text-grey-700">
            <div className="flex items-start gap-2">
              <DotIcon />
              <span>오늘부터 <b className="text-grey-900">7일간 무료체험</b></span>
            </div>
            <div className="flex items-start gap-2">
              <DotIcon />
              <span>7일 후 카드에서 <b className="text-grey-900">{price.toLocaleString()}원</b> 자동결제</span>
            </div>
            <div className="flex items-start gap-2">
              <DotIcon />
              <span>이후 매월 같은 날짜에 자동결제</span>
            </div>
            <div className="flex items-start gap-2">
              <DotIcon />
              <span>해지 시 다음 결제부터 청구되지 않음</span>
            </div>
          </div>
        </div>

        {/* 카드 등록 폼 (클라이언트 컴포넌트) */}
        <CheckoutForm
          tier={validTier}
          userId={user.id}
          userEmail={user.email || ""}
          clientKey={clientKey}
        />

        {/* 안내 */}
        <p className="text-[12px] text-grey-500 text-center mt-5 leading-[1.6]">
          카드 정보는 <b>토스페이먼츠에만</b> 저장되며, 정책알리미 서버에는 저장되지 않습니다.<br />
          결제 진행 시 <a href="/terms" className="underline">이용약관</a>과 <a href="/privacy" className="underline">개인정보처리방침</a>에 동의한 것으로 간주됩니다.
        </p>
      </div>
    </main>
  );
}

function DotIcon() {
  return (
    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" aria-hidden="true" />
  );
}
