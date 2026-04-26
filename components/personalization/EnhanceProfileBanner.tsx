// components/personalization/EnhanceProfileBanner.tsx
// "소득·가구 정보 입력하면 더 정확한 추천" 유도 배너 (홈 hero 다음 위치).
//
// 노출 조건 (server 에서 결정 후 client 에 prop 전달):
//   - 로그인 + 프로필 있음
//   - 온보딩 한 번 거침 (dismissed_onboarding_at !== null)
//   - income_level + household_types 둘 다 미입력 (Phase 1.5 효과 0)
//
// dismiss 는 24h localStorage 로 client 처리 (DB 영구 저장은 빈도 작아 가치 X).
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trackEvent, EVENTS } from '@/lib/analytics';

const STORAGE_KEY = 'enhance_profile_banner_dismissed_at';
const SUPPRESS_MS = 24 * 60 * 60 * 1000; // 24h

export function EnhanceProfileBanner() {
  // SSR flash 방지 — 처음엔 hidden, useEffect 가 localStorage 확인 후 visible 결정.
  // (조건 매칭 자체는 server 에서 끝났고, dismiss 만 client 에서 처리)
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && Date.now() - Number(stored) < SUPPRESS_MS) return;
    setVisible(true);
    trackEvent(EVENTS.PROFILE_ENHANCE_BANNER_SHOWN);
  }, []);

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setVisible(false);
    trackEvent(EVENTS.PROFILE_ENHANCE_BANNER_DISMISSED);
  }

  function handleClick() {
    trackEvent(EVENTS.PROFILE_ENHANCE_BANNER_CLICKED);
  }

  return (
    <div className="max-w-content mx-auto px-10 max-md:px-6 mt-8 max-md:mt-6">
      <div className="flex items-center gap-3 px-5 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
        <span aria-hidden="true" className="text-[18px]">📝</span>
        <p className="flex-1 text-[14px] text-amber-900 leading-[1.5]">
          소득·가구 정보를 추가하면 본인 자격에 맞는 정책을{' '}
          <strong className="font-semibold">분리 섹션</strong>으로 더 정확히
          추천받을 수 있어요.
        </p>
        <Link
          href="/mypage"
          onClick={handleClick}
          className="shrink-0 inline-flex items-center min-h-[36px] px-3 text-[13px] font-semibold text-amber-700 hover:text-amber-900 no-underline"
        >
          입력하기 →
        </Link>
        <button
          onClick={dismiss}
          aria-label="배너 닫기 (24시간 동안 안 보임)"
          className="shrink-0 inline-flex items-center justify-center w-11 h-11 -mr-2 text-amber-700 hover:text-amber-900 bg-transparent border-0 cursor-pointer"
        >
          ×
        </button>
      </div>
    </div>
  );
}
