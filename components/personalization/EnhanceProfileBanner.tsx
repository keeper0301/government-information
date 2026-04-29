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
  // SSR 단계에선 localStorage 접근 불가 → null 리턴 (= "안 닫힌 상태" 의미).
  // server 가 banner 를 visible=true 로 SSR → hydration 후 client snapshot 으로
  // 갱신되며 24h 안 dismiss 한 사용자에겐 잠깐 깜빡 후 사라짐.
  //
  // CRITICAL: Date.now().toString() 같은 nondeterministic 값 절대 금지.
  // useSyncExternalStore 는 server snapshot 이 매 호출 동일해야 React 19 의
  // strict hydration check 통과. nondeterministic 시 hydration 폭발 →
  // 같은 페이지의 RevealOnScroll useEffect 들이 영영 안 돌아 opacity-0 영구 고정.
  // (2026-04-29 사고: 사장님 본인 (로그인+온보딩 완료+income/household 미입력)
  //  화면에서 홈 below-the-fold 8 섹션 텅 빔 — 이 한 줄이 root cause).
  // reconsent-banner.tsx, wish-form-floating.tsx 동일 패턴 (return null) 참고.
  return null;
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
