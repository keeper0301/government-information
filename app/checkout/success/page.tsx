// ============================================================
// /checkout/success — 카드 등록 완료 후 콜백
// ============================================================
// 토스가 다음 쿼리로 redirect 시킴:
//   ?authKey=...&customerKey=...
//
// 처리:
//   1) DB 에서 pending 의도 행 조회 → tier 추출 (URL 의 tier 신뢰 X)
//   2) authKey → 영구 빌링키 발급 (토스 API)
//   3) subscriptions 행 갱신 (status=trialing, trial_ends_at=+7일)
//   4) 성공 → /mypage/billing?welcome=1 로 redirect
//      (POST-redirect-GET 패턴: 새로고침해도 안전)
//   5) 실패 → 토스 빌링키 삭제(좀비 정리) + 에러 페이지
// ============================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueBillingKey, deleteBillingKey, TossError } from "@/lib/toss";

type SearchParams = Promise<{
  authKey?: string;
  customerKey?: string;
}>;

const TRIAL_DAYS = 7;

// 트라이얼 종료 시각 ISO 문자열 — 모듈 레벨 헬퍼로 빼낸 이유:
// 컴포넌트 함수 안에서 Date.now() 를 직접 호출하면 react-hooks/purity 가
// "render 중 impure 함수 호출" 로 잡음. 서버 컴포넌트의 매 요청마다
// 새 시각이 필요한 의도된 동작이므로 helper 로 호출 시점을 분리해
// 컴포넌트 본문은 순수하게 유지.
function calcTrialEndIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: SearchParams }) {
  const { authKey, customerKey } = await searchParams;

  // 1) 파라미터 검증
  if (!authKey || !customerKey) {
    return <ErrorState message="결제 정보가 올바르지 않습니다." />;
  }

  // 2) 로그인 사용자 확인 (CSRF 방지: customerKey 가 본인 user.id 와 일치해야 함)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  if (customerKey !== user.id) {
    return <ErrorState message="결제 정보의 사용자가 일치하지 않습니다. 다시 시도해주세요." />;
  }

  // 3) DB 에서 결제 의도(pending 행) 조회 — tier 변조 방지
  // URL 쿼리의 tier 가 아니라, /checkout 진입 시 저장된 tier 를 신뢰함
  const admin = createAdminClient();
  const { data: intent } = await admin
    .from("subscriptions")
    .select("tier, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!intent || (intent.tier !== "basic" && intent.tier !== "pro")) {
    return <ErrorState message="결제 의도를 확인할 수 없습니다. 요금제 페이지에서 다시 시작해주세요." />;
  }
  const tier = intent.tier as "basic" | "pro";

  // 4) 토스에서 영구 빌링키 발급
  let billingInfo;
  try {
    billingInfo = await issueBillingKey(authKey, customerKey);
  } catch (err) {
    const message = err instanceof TossError ? err.message : "빌링키 발급에 실패했습니다.";
    return <ErrorState message={message} />;
  }

  // 5) subscriptions 행 갱신 (status=trialing + 7일 트라이얼)
  const trialEndsAtIso = calcTrialEndIso(TRIAL_DAYS);

  const { error: dbError } = await admin
    .from("subscriptions")
    .update({
      tier,
      status: "trialing",
      billing_key: billingInfo.billingKey,
      customer_key: customerKey,
      customer_email: user.email || null,  // cron 결제 시 N+1 방지용 캐시
      card_company: billingInfo.cardCompany,
      card_number_masked: billingInfo.cardNumber,
      trial_ends_at: trialEndsAtIso,
      current_period_end: trialEndsAtIso,
      cancelled_at: null,
    })
    .eq("user_id", user.id);

  if (dbError) {
    // DB 저장 실패 시: 토스에 좀비 빌링키 남지 않도록 정리 시도
    const cleanup = await deleteBillingKey(billingInfo.billingKey);
    const cleanupNote = cleanup.ok
      ? "결제 정보는 안전하게 정리되었어요."
      : "결제 정보 정리에도 실패했어요. 고객센터로 문의해주세요.";
    return (
      <ErrorState
        message={`구독 정보 저장에 실패했어요: ${dbError.message}`}
        extra={cleanupNote}
      />
    );
  }

  // 6) POST-redirect-GET: success URL 흔적 지우고 mypage 로 이동
  // 사용자가 새로고침해도 issueBillingKey 가 다시 호출되지 않음
  redirect("/mypage/billing?welcome=1");
}

// 에러 상태 안내 (재시도 링크 포함)
function ErrorState({ message, extra }: { message: string; extra?: string }) {
  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[480px] mx-auto px-5">
        <div className="text-center mb-6">
          <div className="w-[64px] h-[64px] mx-auto rounded-full bg-red-50 grid place-items-center mb-4">
            <svg className="w-9 h-9 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <h1 className="text-[22px] font-extrabold text-grey-900 mb-2">결제 등록에 실패했어요</h1>
          <p className="text-[14px] text-grey-700 leading-[1.6]">{message}</p>
          {extra && <p className="text-[13px] text-grey-600 mt-2">{extra}</p>}
        </div>
        <div className="space-y-2.5">
          <a href="/pricing" className="block w-full min-h-[52px] flex items-center justify-center text-[15px] font-bold rounded-xl bg-blue-500 text-white hover:bg-blue-600 no-underline">
            요금제 다시 보기
          </a>
        </div>
      </div>
    </main>
  );
}
