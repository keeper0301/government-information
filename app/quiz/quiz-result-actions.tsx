'use client';
// app/quiz/quiz-result-actions.tsx
// /quiz 결과 페이지의 두 액션을 묶은 client component:
//   1) "이 답변으로 가입하기" — 답변을 localStorage 에 저장 → /signup 으로 이동
//      → 가입·인증 후 /onboarding 에서 자동 prefill (lib/quiz-prefill 참고)
//   2) "결과 공유하기" — Web Share API → 미지원 환경은 clipboard fallback
//
// 결과 화면 안에 한 곳에서 두 액션을 다루기 위해 한 컴포넌트로 묶음.
// (server component 인 page.tsx 에는 onClick 이 없으므로 분리)

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveQuizPrefill, type QuizPrefill } from '@/lib/quiz-prefill';
import { trackEvent, EVENTS } from '@/lib/analytics';

export function QuizResultActions({
  prefill,
  sharePath,
}: {
  // /signup 으로 이동하기 전 localStorage 에 저장할 답변
  prefill: QuizPrefill;
  // 현재 결과 화면을 그대로 재현하는 path (서버에서 쿼리 포함해 전달, 예: "/quiz?age=30대...")
  // 실제 공유 시점에 window.location.origin 와 합쳐 절대 URL 로 변환
  sharePath: string;
}) {
  const router = useRouter();
  const [shareStatus, setShareStatus] = useState<
    'idle' | 'copied' | 'shared' | 'error'
  >('idle');

  // ────────────────────────────────────────────
  // 1) 가입 클릭 → prefill 저장 → /signup 으로 이동
  // ────────────────────────────────────────────
  function handleSignupClick() {
    saveQuizPrefill(prefill);
    trackEvent(EVENTS.QUIZ_SIGNUP_CLICKED, {
      has_income: prefill.incomeLevel ? 'yes' : 'no',
      has_household: prefill.householdTypes.length > 0 ? 'yes' : 'no',
    });
    router.push('/signup');
  }

  // ────────────────────────────────────────────
  // 2) 공유 클릭 → Web Share / clipboard fallback
  // ────────────────────────────────────────────
  async function handleShareClick() {
    trackEvent(EVENTS.QUIZ_SHARE_CLICKED);

    // 절대 URL 생성 — sharePath 가 path 만 (예: "/quiz?...") 이라 origin 보강
    const absoluteUrl = `${window.location.origin}${sharePath}`;

    // Web Share API (모바일 브라우저 대부분 지원, 데스크톱은 일부)
    type Nav = Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    const nav: Nav = window.navigator;
    if (typeof nav.share === 'function') {
      try {
        await nav.share({
          title: 'keepioo 1분 자격 진단',
          text: '내 자격에 맞는 정부 지원 정책 확인 결과',
          url: absoluteUrl,
        });
        setShareStatus('shared');
        return;
      } catch {
        // 사용자가 시트 취소하면 AbortError — 조용히 fallback 안 함
        setShareStatus('idle');
        return;
      }
    }

    // clipboard fallback
    try {
      await window.navigator.clipboard.writeText(absoluteUrl);
      setShareStatus('copied');
      // 3초 후 상태 복구
      window.setTimeout(() => setShareStatus('idle'), 3000);
    } catch {
      setShareStatus('error');
      window.setTimeout(() => setShareStatus('idle'), 3000);
    }
  }

  const shareLabel =
    shareStatus === 'copied'
      ? '✓ 링크 복사됨'
      : shareStatus === 'shared'
        ? '✓ 공유됨'
        : shareStatus === 'error'
          ? '복사 실패 — 주소창 복사'
          : '결과 공유하기';

  return (
    <>
      {/* 가입 CTA 박스 — 결과 위에 배치 */}
      <div className="mb-6 p-5 bg-blue-50 border border-blue-200 rounded-2xl flex items-center gap-4 max-md:flex-col max-md:items-start">
        <div className="flex-1">
          <p className="text-[15px] font-semibold text-blue-900 mb-1">
            새 정책이 나오면 카톡·이메일로 알려드릴까요?
          </p>
          <p className="text-[13px] text-blue-800 leading-[1.55]">
            가입하면 본인 자격에 맞는 신규 정책을 매일 자동으로 받아볼 수 있어요. (무료)
            <br />
            <span className="text-blue-700">
              방금 입력하신 정보가 마이페이지에 자동으로 채워져요.
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignupClick}
          className="shrink-0 inline-flex items-center min-h-[44px] px-5 text-[14px] font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-xl border-0 cursor-pointer transition-colors max-md:w-full max-md:justify-center"
        >
          무료 가입하고 자동 알림 받기 →
        </button>
      </div>

      {/* 공유 버튼 — 가입 CTA 아래, 결과 목록 위 */}
      <div className="mb-4 flex items-center justify-end">
        <button
          type="button"
          onClick={handleShareClick}
          className="inline-flex items-center min-h-[40px] px-3 text-[13px] font-medium text-grey-700 hover:text-grey-900 bg-white hover:bg-grey-50 rounded-xl border border-grey-200 cursor-pointer transition-colors"
        >
          🔗 {shareLabel}
        </button>
      </div>
    </>
  );
}
