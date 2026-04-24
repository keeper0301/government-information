"use client";

// ============================================================
// ReconsentBanner — 재동의 안내 배너 (클라이언트)
// ============================================================
// 필수 동의(개인정보처리방침·이용약관) 가 누락되었거나 버전이 낮은 사용자에게
// 내용 상단(Nav 바로 아래)에 한 줄 배너로 알림. /mypage 로 이동 CTA + X 닫기.
//
// 동작:
// - 마운트 시 localStorage 의 dismiss 만료시각 체크 → 아직이면 숨김
// - X 누르면 24시간 스누즈 (localStorage 기록)
// - /mypage·/admin·/login 등 특정 경로에서는 자동 숨김 (로그인/관리 플로우 방해 방지)
// ============================================================

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

type Props = {
  missing: Array<"privacy_policy" | "terms">;
};

const DISMISS_KEY = "reconsent-dismissed-until";
const SNOOZE_HOURS = 24;

// 이 경로에서는 배너 숨김 (이미 관리 UI 이거나 인증 플로우 중)
const HIDE_EXACT = ["/login", "/signup"];
const HIDE_PREFIXES = ["/onboarding", "/auth", "/mypage", "/admin"];

function isHiddenPath(pathname: string): boolean {
  if (HIDE_EXACT.includes(pathname)) return true;
  return HIDE_PREFIXES.some((p) => pathname.startsWith(p));
}

// 동의 종류 → 사람이 읽는 라벨
function labelOf(type: "privacy_policy" | "terms"): string {
  return type === "privacy_policy" ? "개인정보처리방침" : "이용약관";
}

// localStorage 의 스누즈 만료시각을 외부 store 로 구독해서 render 에서 바로 읽음.
// (useEffect + setState 안티패턴을 피하기 위한 정석 패턴. SSR-safe · 크로스탭 동기화 덤.)
function subscribeSnooze(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
function getSnoozeClient(): string | null {
  try {
    const until = localStorage.getItem(DISMISS_KEY);
    // 만료 시각 지났으면 null 로 정규화 — 시간 경과에 따라 자동 재노출.
    return until && new Date(until).getTime() > Date.now() ? until : null;
  } catch {
    return null;
  }
}
function getSnoozeServer(): string | null {
  // SSR 시엔 스누즈 없다고 가정 (localStorage 접근 불가).
  // 초기 렌더 결과는 pathname·missing 조건으로 별도 가드됨.
  return null;
}

export function ReconsentBanner({ missing }: Props) {
  const pathname = usePathname();
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
      // 같은 탭에서는 storage 이벤트 발생 안 함 → 수동 dispatch 로 store 갱신.
      window.dispatchEvent(
        new StorageEvent("storage", { key: DISMISS_KEY, newValue: until }),
      );
    } catch {
      // localStorage 못 써도 현재 화면엔 계속 배너 떠있음 (다음 방문 때 다시 판정).
    }
  }

  if (snoozedUntil || isHiddenPath(pathname) || missing.length === 0) return null;

  // "개인정보처리방침·이용약관" 또는 "개인정보처리방침" 등
  const labelList = missing.map(labelOf).join("·");

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-[58px] z-40 bg-amber-50 border-b border-amber-200"
    >
      <div className="max-w-content mx-auto px-10 py-3 max-md:px-5 flex items-center gap-4 max-md:gap-3">
        <span aria-hidden="true" className="text-[16px]">
          📋
        </span>
        <p className="flex-1 text-[13px] leading-[1.5] text-amber-900 max-md:text-[12px]">
          <span className="font-semibold">{labelList}</span> 동의 기록을 확인해
          주세요. 최신 방침에 동의하시면 맞춤 알림·추천을 정확하게 받을 수 있어요.
        </p>
        <a
          href="/mypage"
          className="shrink-0 text-[13px] font-semibold text-amber-900 no-underline hover:underline whitespace-nowrap max-md:text-[12px]"
        >
          확인하러 가기 →
        </a>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="배너 닫기"
          className="shrink-0 w-11 h-11 grid place-items-center border-none bg-transparent cursor-pointer text-amber-800 hover:bg-amber-100 rounded-full"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
