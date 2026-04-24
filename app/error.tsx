"use client";

// ============================================================
// 전역 에러 바운더리 (app/error.tsx)
// ============================================================
// Next.js App Router 의 error convention. 라우트 렌더링 중 예외 발생 시
// 이 컴포넌트가 대체 UI 로 표시됨. client component 필수 ('use client').
//
// reset() — 에러 바운더리만 재시도 (전체 페이지 리로드 아님). useEffect 로
// 서버 로그에도 에러 남겨 디버깅 가능하게.
//
// 참고: 인증·프로필 같은 클리티컬 데이터 로드 실패 시 이 화면이 뜨므로
// "다시 시도" + "홈으로" 두 개 경로 모두 제공.
// ============================================================

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Vercel 로그로 추적. digest 는 Next.js 가 부여하는 에러 식별자.
    console.error("[app/error] 렌더링 중 예외:", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <main className="min-h-screen bg-grey-50 flex items-center justify-center px-5 py-20">
      <div className="max-w-[520px] w-full text-center">
        <div className="mb-8">
          <p className="text-[13px] font-semibold text-red tracking-[0.2em] mb-3">
            문제가 생겼어요
          </p>
          <h1 className="text-[26px] md:text-[32px] font-extrabold tracking-[-0.6px] text-grey-900 mb-3 leading-[1.3]">
            페이지를 불러올 수 없어요
          </h1>
          <p className="text-[15px] text-grey-700 leading-[1.6]">
            일시적인 문제일 수 있어요.
            <br />
            잠시 후 다시 시도해 주세요.
          </p>
        </div>

        {/* 에러 식별자 — 사장님께 문의 시 이 ID 를 공유하면 Vercel 로그에서
            해당 요청 빠르게 추적 가능. digest 는 Next.js production 빌드에서만 생성. */}
        {error.digest && (
          <div className="bg-white border border-grey-200 rounded-lg p-3 mb-6 text-[12px] text-grey-600 font-mono break-all">
            에러 식별자: {error.digest}
          </div>
        )}

        <div className="flex gap-2 justify-center flex-wrap">
          <button
            type="button"
            onClick={reset}
            className="min-h-[44px] inline-flex items-center px-5 bg-blue-500 text-white rounded-lg text-[14px] font-bold hover:bg-blue-600 transition-colors cursor-pointer"
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="min-h-[44px] inline-flex items-center px-5 bg-white border border-grey-200 text-grey-700 rounded-lg text-[14px] font-bold hover:bg-grey-50 no-underline"
          >
            홈으로
          </Link>
        </div>

        <p className="mt-8 text-[12px] text-grey-600">
          문제가 반복되면{" "}
          <Link href="/help" className="text-blue-500 hover:underline">
            도움말
          </Link>
          에서 해결 방법을 확인해 주세요.
        </p>
      </div>
    </main>
  );
}
