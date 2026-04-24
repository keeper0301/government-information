"use client";

// ============================================================
// CheckoutForm — 카드 등록 클라이언트 폼
// ============================================================
// "카드 등록하기" 클릭 → 토스페이먼츠 SDK 의 requestBillingAuth 호출
// → 토스 도메인으로 이동 → 카드 정보 입력
// → 토스가 successUrl(/checkout/success) 또는 failUrl(/checkout/fail) 로 redirect
// ============================================================

import { useState } from "react";
import { loadTossPayments } from "@tosspayments/payment-sdk";
import { TIER_NAMES } from "@/lib/subscription";

type Props = {
  tier: "basic" | "pro";
  userId: string;
  userEmail: string;
  clientKey: string;
};

export function CheckoutForm({ tier, userId, userEmail, clientKey }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 토스 빌링 인증 시작 (카드 등록 페이지로 이동)
  async function handleRegisterCard() {
    setLoading(true);
    setError(null);

    try {
      // 토스 SDK 동적 로딩 — 페이지 진입 시점이 아니라 버튼 클릭 시점에 로드
      const tossPayments = await loadTossPayments(clientKey);

      // customerKey: 토스에서 사용자를 식별하는 키
      // user.id 를 그대로 사용 (UUID 형식, 토스 요구사항 통과)
      // 같은 사용자는 항상 같은 customerKey 를 보내야 빌링키 재사용 가능
      const customerKey = userId;

      // 결제 후 돌아올 URL
      // tier 는 URL 로 넘기지 않음 — /checkout 진입 시 DB 에 'pending' 상태로 저장된
      // 의도(tier)를 success 페이지가 신뢰함 (URL 변조 방지)
      const origin = window.location.origin;
      const successUrl = `${origin}/checkout/success`;
      const failUrl = `${origin}/checkout/fail`;

      // requestBillingAuth: 카드 등록(빌링 인증) 요청
      // "카드" 는 결제 수단 (현재는 카드만 지원)
      // 호출 후 토스 도메인으로 이동하므로 이 줄 다음 코드는 실패 시에만 실행됨
      await tossPayments.requestBillingAuth("카드", {
        customerKey,
        successUrl,
        failUrl,
      });
    } catch (err) {
      // 사용자가 팝업 닫음 / 네트워크 에러 등
      const message = err instanceof Error ? err.message : "카드 등록을 시작할 수 없습니다.";
      setError(message);
      setLoading(false);
    }
  }

  const tierName = TIER_NAMES[tier];

  return (
    <div className="bg-white rounded-2xl border border-grey-100 shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-6">
      {/* 등록할 이메일 안내 */}
      <div className="mb-4">
        <div className="text-[13px] text-grey-600 mb-1">결제 알림 받을 이메일</div>
        <div className="text-[15px] font-semibold text-grey-900">{userEmail}</div>
      </div>

      {/* 카드 등록 버튼 */}
      <button
        type="button"
        onClick={handleRegisterCard}
        disabled={loading}
        className={`w-full min-h-[56px] flex items-center justify-center gap-2 text-[16px] font-bold rounded-xl border-none cursor-pointer transition-colors ${
          loading
            ? "bg-grey-200 text-grey-600 cursor-wait"
            : "bg-blue-500 text-white hover:bg-blue-600 shadow-[0_2px_8px_rgba(49,130,246,0.25)]"
        }`}
      >
        {loading ? (
          <>
            <Spinner /> 토스로 이동 중...
          </>
        ) : (
          <>
            <CardIcon /> {tierName} 7일 무료체험 시작 (카드 등록)
          </>
        )}
      </button>

      {/* 에러 메시지 */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-[13px] text-red-700 leading-[1.5]">
          {error}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}
