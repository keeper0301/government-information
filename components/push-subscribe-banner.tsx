"use client";

// ============================================================
// PWA 푸시 구독 유도 banner (2026-05-27 Spec 3 follow-up)
// ============================================================
// subscriber 0 단계 → 첫 구독 가속. 로그인 사용자 중 PWA push 미구독 사용자
// 에게만 표시. dismissible (localStorage 7일).
//
// 가드:
//   - 로그인 사용자만 (isLoggedIn prop)
//   - 권한 'denied' 시 자동 hide (사용자 거부 의사 존중)
//   - 이미 구독 (pushManager.getSubscription) 했으면 hide
//   - 7일 안 dismiss 한 사용자는 hide
//   - sw 미지원 브라우저 hide
// ============================================================

import Link from "next/link";
import { useEffect, useState } from "react";

const DISMISS_KEY = "keepioo-push-banner-dismissed-at";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function PushSubscribeBanner({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (typeof window === "undefined") return;

    // 1) dismiss 확인 (7일)
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - Number(dismissedAt);
      if (Number.isFinite(elapsed) && elapsed < DISMISS_TTL_MS) return;
    }

    // 2) 브라우저 기능 + 권한 거부 가드
    if (!("Notification" in window)) return;
    if (!("serviceWorker" in navigator)) return;
    if (Notification.permission === "denied") return;

    // 3) 이미 구독했는지 확인 — sw 등록 + pushManager subscription
    navigator.serviceWorker
      .getRegistration()
      .then(async (reg) => {
        if (!reg) {
          setShow(true);
          return;
        }
        try {
          const sub = await reg.pushManager.getSubscription();
          if (!sub) setShow(true);
        } catch {
          setShow(true); // pushManager 접근 실패 시 banner 표시 (사용자 후 결정)
        }
      })
      .catch(() => {
        // sw registration 실패 — banner 표시 OK (사용자가 마이페이지에서 다시 시도)
        setShow(true);
      });
  }, [isLoggedIn]);

  function handleDismiss() {
    if (typeof window !== "undefined") {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="mx-auto max-w-content px-4 mt-3">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-base shrink-0" aria-hidden>
            🔔
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-blue-900 leading-tight">
              새 정책 매칭을 PWA 푸시 알림으로 받아보세요
            </p>
            <p className="mt-0.5 text-[12px] text-blue-700/80 leading-snug">
              브라우저 닫혀있어도 마감 임박·신규 매칭 정책을 즉시 알림. 클릭률에 맞춰
              발송 시간도 자동 학습.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link
            href="/mypage/account"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            알림 설정 →
          </Link>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-md p-1.5 text-blue-700/70 hover:bg-blue-100 hover:text-blue-900 transition-colors"
            aria-label="banner 닫기"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M3 3 L11 11 M11 3 L3 11" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
