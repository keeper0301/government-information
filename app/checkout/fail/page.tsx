// ============================================================
// /checkout/fail — 카드 등록 실패 콜백
// ============================================================
// 토스가 다음 쿼리로 redirect:
//   ?code=ERROR_CODE&message=에러메시지&orderId=...
// 사용자에게 친절한 안내 + 재시도 링크 표시
// ============================================================

import Link from "next/link";

type SearchParams = Promise<{
  code?: string;
  message?: string;
}>;

// 자주 나오는 토스 에러 코드를 한국어 안내로 매핑
// (목록은 토스 공식 문서: https://docs.tosspayments.com/reference/error-codes)
const FRIENDLY_MESSAGES: Record<string, string> = {
  USER_CANCEL: "결제 창을 닫으셨어요. 다시 시도해보시겠어요?",
  PAY_PROCESS_CANCELED: "결제가 취소되었어요. 다시 시도해보시겠어요?",
  INVALID_CARD_NUMBER: "카드번호가 올바르지 않아요. 다시 확인해주세요.",
  EXCEED_MAX_AUTH_COUNT: "인증 시도 횟수를 초과했어요. 잠시 후 다시 시도해주세요.",
  INVALID_BIRTH: "생년월일이 올바르지 않아요.",
  INVALID_PASSWORD: "비밀번호가 올바르지 않아요.",
  EXCEED_MAX_DAILY_PAYMENT_COUNT: "오늘 결제 가능 횟수를 초과했어요. 내일 다시 시도해주세요.",
};

export default async function CheckoutFailPage({ searchParams }: { searchParams: SearchParams }) {
  const { code, message } = await searchParams;

  // 친절한 메시지로 변환, 없으면 토스가 보낸 원문 사용
  const friendly = code && FRIENDLY_MESSAGES[code]
    ? FRIENDLY_MESSAGES[code]
    : (message || "카드 등록 중 문제가 발생했어요.");

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[480px] mx-auto px-5">
        <div className="text-center mb-6">
          <div className="w-[64px] h-[64px] mx-auto rounded-full bg-red-50 grid place-items-center mb-4">
            <svg className="w-9 h-9 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="text-[22px] font-extrabold text-grey-900 mb-2">
            카드 등록을 완료하지 못했어요
          </h1>
          <p className="text-[14px] text-grey-700 leading-[1.6]">{friendly}</p>
          {code && (
            <p className="text-[13px] text-grey-600 mt-2 font-mono">에러 코드: {code}</p>
          )}
        </div>

        <div className="space-y-2.5">
          <Link
            href="/pricing"
            className="block w-full min-h-[52px] flex items-center justify-center text-[15px] font-bold rounded-xl bg-blue-500 text-white hover:bg-blue-600 no-underline"
          >
            다시 시도하기
          </Link>
          <Link
            href="/"
            className="block w-full min-h-[44px] flex items-center justify-center text-[14px] font-medium rounded-xl text-grey-700 hover:bg-grey-100 no-underline"
          >
            홈으로 돌아가기
          </Link>
        </div>

        <p className="text-[13px] text-grey-600 text-center mt-8 leading-[1.65]">
          계속 문제가 있다면 <a href="mailto:keeper0301@gmail.com" className="underline">고객센터</a>로 문의해주세요.
        </p>
      </div>
    </main>
  );
}
