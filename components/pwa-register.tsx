"use client";
// keepioo PWA service worker 등록 — RootLayout 에 마운트.
//
// 역할:
//  · 브라우저에서 /sw.js 를 service worker 로 등록
//  · 등록 후부터 offline 캐싱 + push 알림 listener 가 작동
//
// 사용자 동의 정책:
//  · 등록 자체는 사용자 동의 불필요 (offline 캐싱·홈화면 추가용)
//  · push subscribe 는 명시적 동의 후 별도 phase 에서 활성화 (여기 안 함)
//
// 환경 분기:
//  · localhost (개발 dev 모드) 에서는 등록 생략 — Next.js dev 의 hot reload 와
//    service worker 캐시가 충돌해 코드 변경이 반영 안 되는 사고 방지
//  · production·preview (Vercel) 에서만 실제 등록

import { useEffect } from "react";

export function PWARegister() {
  useEffect(() => {
    // SSR 가드 — 서버에서는 window 가 없으므로 즉시 종료
    if (typeof window === "undefined") return;

    // 브라우저가 service worker 자체를 지원하지 않는 경우 (예: 구형 IE)
    if (!("serviceWorker" in navigator)) return;

    // 로컬 개발 환경에서는 등록 skip — dev hot reload 충돌 방지
    if (window.location.hostname === "localhost") return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // 등록 실패는 일반 웹 사용에는 영향 없음 (offline·push 만 비활성)
      console.warn("[PWA] service worker 등록 실패:", err);
    });
  }, []);

  // 시각적 출력 없음 — 사이드 이펙트(등록) 만 담당
  return null;
}
