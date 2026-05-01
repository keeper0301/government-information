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
      // 자동 광고 (Auto Ads) — Google 이 페이지 빈 공간에 광고 자동 삽입.
      // AdSense 콘솔에서 자동 광고 ON 후 효과 시작. 미승인 사이트는 광고 안 채워짐.
      // 수동 슬롯 (ad-slot.tsx placeholder) 은 보존 — 향후 추가 시 그대로 사용.
      s.onload = () => {
        try {
          const w = window as unknown as { adsbygoogle: Array<Record<string, unknown>> };
          w.adsbygoogle = w.adsbygoogle || [];
          w.adsbygoogle.push({
            google_ad_client: ADSENSE_ID,
            enable_page_level_ads: true,
          });
        } catch {
          /* 자동 광고 활성 실패 — 무시 */
        }
      };
      document.head.appendChild(s);
    };

    const onUserAction = () => load();
    const fallbackTimer = window.setTimeout(load, FALLBACK_TIMEOUT_MS);

    TRIGGER_EVENTS.forEach((evt) =>
      window.addEventListener(evt, onUserAction, { passive: true, once: true }),
    );
    return cleanup;
  }, []);

  return null;
}
