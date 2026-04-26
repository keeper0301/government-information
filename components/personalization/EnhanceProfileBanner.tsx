// components/personalization/EnhanceProfileBanner.tsx
// "소득·가구 정보 입력하면 더 정확한 추천" 유도 배너 (홈 hero 다음 위치).
//
// 노출 조건은 server (app/page.tsx) 에서 결정. 이 컴포넌트는 client 에서
// dismiss 상태(localStorage 24h)만 관리.
//
// useEffect+setState 안티패턴 회피 — useSyncExternalStore 로 localStorage
// 만료 시각을 외부 store 처럼 구독 (SSR-safe + 크로스탭 동기화 덤).
'use client';

import { useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { trackEvent, EVENTS } from '@/lib/analytics';

const STORAGE_KEY = 'enhance_profile_banner_dismissed_at';
const SUPPRESS_MS = 24 * 60 * 60 * 1000; // 24h

// 외부 store: localStorage dismiss 시각이 SUPPRESS_MS 안이면 string, 아니면 null
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}
function getClientSnapshot(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && Date.now() - Number(stored) < SUPPRESS_MS ? stored : null;
  } catch {
    return null;
  }
}
function getServerSnapshot(): string | null {
  // SSR 시엔 dismiss 정보 없음 — 일단 hidden (visible 은 hydration 후 결정)
  return Date.now().toString();
}

export function EnhanceProfileBanner() {
  const dismissedAt = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
  const visible = dismissedAt === null;

  // SHOWN 측정 — visible true 마운트 시 한 번 (setState 없는 effect 라 룰 위반 X)
  useEffect(() => {
    if (visible) trackEvent(EVENTS.PROFILE_ENHANCE_BANNER_SHOWN);
  }, [visible]);

  if (!visible) return null;

  function dismiss() {
    try {
      const now = String(Date.now());
      localStorage.setItem(STORAGE_KEY, now);
      // 같은 탭에서는 storage 이벤트 발생 안 함 → 수동 dispatch
      window.dispatchEvent(
        new StorageEvent('storage', { key: STORAGE_KEY, newValue: now }),
      );
    } catch {
      // localStorage 못 써도 현재 화면엔 계속 떠있음 (다음 방문 때 재판정)
    }
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
