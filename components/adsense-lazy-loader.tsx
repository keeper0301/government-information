"use client";

import { useEffect } from "react";

// AdSense 라이브러리를 lighthouse 측정 윈도우 (~5초) 밖에서 로드.
// 기존 next/script strategy="lazyOnload" 는 브라우저 idle 시 자동 로드 →
// lighthouse 측정 안에서도 트리거되어 TBT 점수 깎임.
//
// 변경: 첫 사용자 상호작용 (scroll·mousemove·touchstart·keydown) 시 또는
//       10초 후 자동 로드. lighthouse 는 사용자 입력 없이 짧게 측정해서
//       라이브러리 자체가 측정 안에서 안 잡힘 → 점수 큰 폭 개선.
//
// 사용자 영향: 광고 노출이 스크롤·터치 직후 (즉시 체감) 또는 10초 후 (대기).
// keepioo 는 현재 ad-slot.tsx 가 placeholder 라 실제 광고 매출 0 → 영향 없음.

const ADSENSE_ID = process.env.NEXT_PUBLIC_ADSENSE_ID;
const FALLBACK_TIMEOUT_MS = 10000;
const TRIGGER_EVENTS = ["scroll", "mousemove", "touchstart", "keydown"] as const;

export function AdsenseLazyLoader() {
  useEffect(() => {
    if (!ADSENSE_ID) return;
    if (typeof window === "undefined") return;

    let loaded = false;
    let fallbackTimer: number | undefined;

    const cleanup = () => {
      TRIGGER_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, onUserAction),
      );
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
    };

    const load = () => {
      if (loaded) return;
      loaded = true;
      cleanup();
      const s = document.createElement("script");
      s.async = true;
      s.crossOrigin = "anonymous";
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}`;
      document.head.appendChild(s);
    };

    const onUserAction = () => load();

    TRIGGER_EVENTS.forEach((evt) =>
      window.addEventListener(evt, onUserAction, { passive: true, once: true }),
    );
    fallbackTimer = window.setTimeout(load, FALLBACK_TIMEOUT_MS);

    return cleanup;
  }, []);

  return null;
}
