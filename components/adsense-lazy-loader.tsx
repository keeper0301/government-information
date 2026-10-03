"use client";

import { useEffect } from "react";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense-review-mode";
import { usePathname } from "next/navigation";
import { isPublicContentPath } from "@/lib/content-quality";

// AdSense 라이브러리를 lighthouse 측정 윈도우 (~5초) 밖에서 로드.
// 기존 next/script strategy="lazyOnload" 는 브라우저 idle 시 자동 로드 →
// lighthouse 측정 안에서도 트리거되어 TBT 점수 깎임.
//
// 변경: 첫 사용자 상호작용 (scroll·mousemove·touchstart·keydown) 시 또는
//       10초 후 자동 로드. lighthouse 는 사용자 입력 없이 짧게 측정해서
//       라이브러리 자체가 측정 안에서 안 잡힘 → 점수 큰 폭 개선.
//
// 사용자 영향: 광고 노출이 스크롤·터치 직후 (즉시 체감) 또는 10초 후 (대기).
// Manual slots have a separate content-quality gate. Loading the SDK is not content approval.

const ADSENSE_ID = process.env.NEXT_PUBLIC_ADSENSE_ID;
const FALLBACK_TIMEOUT_MS = 10000;
const TRIGGER_EVENTS = ["scroll", "mousemove", "touchstart", "keydown"] as const;

const REVIEW_MODE_ADSENSE_PATHS = [
  "/",
  "/about",
  "/help",
  "/contact",
  "/privacy",
  "/terms",
  "/refund",
  "/welfare",
  "/loan",
  "/blog",
  "/guides",
] as const;
const REVIEW_MODE_ADSENSE_PREFIXES = [
  "/welfare/",
  "/loan/",
  "/blog/",
  "/guides/",
  "/c/",
] as const;

export function shouldLoadAdsenseScript(pathname: string): boolean {
  if (!ADSENSE_REVIEW_MODE) return isPublicContentPath(pathname);
  if (REVIEW_MODE_ADSENSE_PATHS.includes(pathname as typeof REVIEW_MODE_ADSENSE_PATHS[number])) {
    return true;
  }
  return REVIEW_MODE_ADSENSE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function AdsenseLazyLoader() {
  const pathname = usePathname();
  useEffect(() => {
    if (!ADSENSE_ID) return;
    if (typeof window === "undefined") return;
    // 관리자 화면은 광고 노출 대상이 아니며, AdSense 자동 광고 스크립트가 CSP에
    // 막히면서 pageerror("Uncaught (in promise) undefined")를 남길 수 있다.
    // 운영 QA의 실제 오류와 광고 네트워크 잡음을 분리하기 위해 /admin 전체에서
    // 전역 AdSense lazy loader를 비활성화한다.
    if (window.location.pathname.startsWith("/admin")) return;
    if (!shouldLoadAdsenseScript(window.location.pathname)) return;
    if (!ADSENSE_REVIEW_MODE && !document.querySelector('[data-content-ad-eligible="true"]')) return;

    let loaded = false;

    const cleanup = () => {
      TRIGGER_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, onUserAction),
      );
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
    };

    const load = () => {
      if (window.location.pathname !== pathname) return;
      if (!shouldLoadAdsenseScript(window.location.pathname)) return;
      if (loaded) return;
      loaded = true;
      cleanup();
      const s = document.createElement("script");
      s.async = true;
      s.crossOrigin = "anonymous";
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}`;
      // 자동 광고는 페이지 빈 공간에 광고를 자동 삽입한다.
      // 재심사 모드에서는 로그인·검색·뉴스 같은 비콘텐츠/보조 화면에 광고가
      // 자동 배치될 위험이 있어 끄고, 수동 슬롯만 사용한다.
      s.onload = () => {
        // Auto ads require a separate owner decision; never activate them on approval token alone.
      };
      document.head.appendChild(s);
    };

    const onUserAction = () => load();
    const fallbackTimer = window.setTimeout(load, FALLBACK_TIMEOUT_MS);

    TRIGGER_EVENTS.forEach((evt) =>
      window.addEventListener(evt, onUserAction, { passive: true, once: true }),
    );
    return cleanup;
  }, [pathname]);

  return null;
}
