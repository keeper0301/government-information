"use client";

import { useState } from "react";

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    const title = document.title;

    // 앱(Capacitor) 환경: 안드로이드 WebView 의 navigator.share 가 불안정/미지원이라
    // 네이티브 공유 시트(카톡·메시지 등)를 직접 호출한다. window.Capacitor 는 앱이 런타임에
    // 주입하는 전역 — import 없이 직접 확인하므로 일반 웹 사용자는 capacitor 청크를 받지 않고
    // (전역이 없어) 곧장 아래 기존 웹 경로를 탄다. @capacitor/share 는 앱일 때만 lazy 로드.
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) {
      try {
        const { Share } = await import("@capacitor/share");
        await Share.share({ title, url });
      } catch {
        // 공유 모듈 로드 실패 또는 사용자가 공유를 취소함 — 정상 처리(앱 경로 종료)
      }
      return; // 네이티브 경로 종료 (웹 fallback 으로 내려가지 않음)
    }

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // 사용자가 취소하거나 미지원 시 클립보드로 fallback
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API 미지원
    }
  };

  return (
    <button
      onClick={handleShare}
      className="px-5 py-3 bg-grey-100 text-grey-700 text-[15px] font-semibold rounded-xl hover:bg-grey-200 transition-colors cursor-pointer"
    >
      {copied ? "링크 복사됨!" : "공유하기"}
    </button>
  );
}
