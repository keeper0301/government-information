"use client";

import { useState } from "react";

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    const title = document.title;

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
