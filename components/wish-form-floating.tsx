"use client";

import { useState, useSyncExternalStore } from "react";
import { WishForm } from "./wish-form";

// ============================================================
// FloatingWishWidget — 좌측 하단 floating 의견 수집 위젯
// ============================================================
// 본문 섹션을 차지하지 않고 화면 좌측 하단에 떠 있는 작은 토글 버튼.
// 클릭하면 WishForm 패널이 열리고, X 버튼으로 닫을 수 있음.
// "오늘 하루 보지 않기" 누르면 24시간 동안 토글 버튼도 숨겨짐.
// 챗봇(우측 하단) 과 충돌 안 나도록 좌측에 배치.
//
// 스누즈 상태는 reconsent-banner 와 동일하게 useSyncExternalStore 로 구독해
// useEffect + setState 안티패턴을 피함 (lint 룰 set-state-in-effect 통과).
// ============================================================

const DISMISS_KEY = "keepioo:wish-widget-dismissed-until";
const SNOOZE_HOURS = 24;

// localStorage 의 스누즈 만료시각을 외부 store 로 구독
function subscribeSnooze(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
function getSnoozeClient(): string | null {
  try {
    const until = localStorage.getItem(DISMISS_KEY);
    // 만료 시각 지났으면 null — 자동 재노출
    return until && new Date(until).getTime() > Date.now() ? until : null;
  } catch {
    return null;
  }
}
function getSnoozeServer(): string | null {
  // SSR 시엔 스누즈 없다고 가정 (localStorage 접근 불가)
  return null;
}

export function FloatingWishWidget() {
  const [open, setOpen] = useState(false);
  const snoozedUntil = useSyncExternalStore(
    subscribeSnooze,
    getSnoozeClient,
    getSnoozeServer,
  );

  function handleDismiss() {
    try {
      const until = new Date(
        Date.now() + SNOOZE_HOURS * 60 * 60 * 1000,
      ).toISOString();
      localStorage.setItem(DISMISS_KEY, until);
      // 같은 탭에선 storage 이벤트 발생 안 함 → 수동 dispatch 로 store 갱신
      window.dispatchEvent(
        new StorageEvent("storage", { key: DISMISS_KEY, newValue: until }),
      );
    } catch {
      // localStorage 막힌 환경이면 그냥 패널만 닫음
    }
    setOpen(false);
  }

  // 스누즈 중이면 토글 버튼·패널 모두 숨김
  if (snoozedUntil) return null;

  // WishForm 은 항상 mount 시켜 두고 패널만 hidden 으로 토글 — 사용자가 실수로
  // X 눌러도 입력 중이던 텍스트·이메일이 사라지지 않도록.
  return (
    <>
      {/* 좌측 하단 토글 버튼 — 닫혀 있을 때만 노출. state 가 없어
          unmount 해도 손실 없음. (Tailwind flex 가 HTML hidden 을
          override 하므로 조건부 렌더가 가장 안전한 방법.) */}
      {!open && (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-7 left-7 z-40 h-11 pl-3 pr-4 rounded-full bg-white border border-grey-200 shadow-[0_2px_12px_rgba(0,0,0,0.08)] flex items-center gap-2 cursor-pointer transition-all duration-200 hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:-translate-y-[1px] max-md:bottom-5 max-md:left-4 max-md:h-10 max-md:pl-2.5 max-md:pr-3"
        aria-label="의견 보내기 열기"
      >
        <span className="text-[16px] leading-none" aria-hidden="true">
          💌
        </span>
        <span className="text-[13px] font-bold text-grey-900 tracking-[-0.2px] max-md:text-[12px]">
          한 마디
        </span>
      </button>
      )}

      {/* 패널 — 항상 mount, open 상태에 따라 표시만 토글
          (WishForm 내부 입력 보존 위해. div 는 display class 가 없어
          HTML hidden 속성이 정상 동작.) */}
      <div
        role="dialog"
        aria-label="받고 싶은 혜택 의견 보내기"
        aria-hidden={!open}
        hidden={!open}
        className="fixed bottom-7 left-7 z-40 w-[340px] max-md:w-[calc(100vw-32px)] max-md:left-4 max-md:bottom-5"
      >
        {/* 닫기 버튼 — 패널 우측 상단, 모바일 터치 영역 36px 확보 */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute top-1.5 right-1.5 z-10 w-9 h-9 rounded-full bg-white/80 hover:bg-grey-50 grid place-items-center cursor-pointer border-0 transition-colors"
          aria-label="패널 닫기"
        >
          <svg
            className="w-3.5 h-3.5 text-grey-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <WishForm />

        {/* 24시간 숨기기 — 작은 보조 링크 */}
        <div className="mt-2 text-center">
          <button
            type="button"
            onClick={handleDismiss}
            className="text-[11px] text-grey-500 hover:text-grey-700 underline underline-offset-2 bg-transparent border-0 cursor-pointer p-1"
          >
            오늘 하루 보지 않기
          </button>
        </div>
      </div>
    </>
  );
}
