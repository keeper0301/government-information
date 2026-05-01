// ============================================================
// PopularPicksAside — 인기 정책 사이드 배너 (client wrapper)
// ============================================================
// HomePopularPicks (server) 가 데이터 fetch + null 체크 후 위임.
// 이 컴포넌트는 dismiss 인터랙션 + JSX 렌더 담당.
//
// 사용자 피로도 방지:
//   - 닫기 X 버튼 우상단 absolute
//   - 24시간 localStorage 스누즈 (reconsent-banner 와 일관 패턴)
//   - 24h 후 자동 복귀 — dismiss 영구 X (인기 정책은 매일 변동, 가입 funnel 보존)
//   - GA4 HOME_POPULAR_DISMISSED 측정 → 닫기율 모니터링
// ============================================================

"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Flame, X } from "lucide-react";
import { TrackedLink } from "./tracked-link";
import { EVENTS, trackEvent } from "@/lib/analytics";
import type { PopularPick } from "@/lib/popular-picks";

// 단일 truth source — lib/popular-picks.ts 의 PopularPick 타입 재export
export type { PopularPick };

const SNOOZE_KEY = "home-popular-snooze";
const SNOOZE_HOURS = 24;

function subscribeToSnoozeChange() {
  return () => {};
}

function getSnoozeSnapshot(): boolean {
  try {
    const snooze = localStorage.getItem(SNOOZE_KEY);
    return !!snooze && Date.now() < Number(snooze);
  } catch {
    return false;
  }
}

function getServerSnoozeSnapshot(): boolean {
  return false;
}

// 마감일 → 사람 읽기 쉬운 D-X 문자열 (KST 기준)
function formatDeadline(apply_end: string | null): string {
  if (!apply_end) return "상시 모집";
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const todayKst = new Date(Date.now() + KST_OFFSET_MS);
  const todayY = todayKst.getUTCFullYear();
  const todayM = todayKst.getUTCMonth();
  const todayD = todayKst.getUTCDate();
  const today = new Date(Date.UTC(todayY, todayM, todayD));
  const end = new Date(apply_end);
  const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const days = Math.round((endUtc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return "마감";
  if (days === 0) return "오늘 마감";
  if (days <= 7) return `D-${days}`;
  return `${endUtc.getUTCMonth() + 1}월 ${endUtc.getUTCDate()}일 마감`;
}

export function PopularPicksAside({
  picks,
  isLoggedIn,
}: {
  picks: PopularPick[];
  isLoggedIn: boolean;
}) {
  // SSR 시 보이게, hydration 후 localStorage 검사 → snooze 면 hidden.
  // 잠깐 flicker 가능하지만 모달·배너 표준 패턴 (reconsent-banner 와 동일).
  const snoozed = useSyncExternalStore(
    subscribeToSnoozeChange,
    getSnoozeSnapshot,
    getServerSnoozeSnapshot,
  );
  const [dismissed, setDismissed] = useState(false);
  const hidden = dismissed || snoozed;

  if (hidden) return null;

  const dismiss = () => {
    try {
      const expires = Date.now() + SNOOZE_HOURS * 60 * 60 * 1000;
      localStorage.setItem(SNOOZE_KEY, String(expires));
    } catch {
      // localStorage 실패해도 state 만으로 hidden — 같은 페이지 안에선 안 보임
    }
    trackEvent(EVENTS.HOME_POPULAR_DISMISSED, { snooze_hours: SNOOZE_HOURS });
    setDismissed(true);
  };

  return (
    <aside
      className="relative w-full rounded-2xl bg-white border border-grey-200 p-4 max-md:p-3"
      aria-labelledby="popular-picks-title"
    >
      {/* 닫기 X 버튼 — 우상단 absolute, 24h 스누즈 */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="인기 정책 사이드 배너 닫기 (24시간)"
        className="absolute top-2 right-2 w-7 h-7 rounded-full inline-flex items-center justify-center text-grey-500 hover:bg-grey-100 hover:text-grey-700 transition-colors"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>

      <div className="flex items-baseline justify-between mb-3 pr-8">
        <h2
          id="popular-picks-title"
          className="text-[15px] font-extrabold text-grey-900 tracking-[-0.3px] inline-flex items-center gap-1.5"
        >
          <Flame className="w-4 h-4 text-orange-500" aria-hidden="true" />
          인기 정책 TOP {picks.length}
        </h2>
        <Link
          href="/welfare?sort=popular"
          className="text-[12px] font-semibold text-blue-500 hover:text-blue-600 no-underline"
        >
          전체 →
        </Link>
      </div>

      <ol className="grid gap-1.5">
        {picks.map((p, i) => (
          <li key={`${p.kind}-${p.id}`}>
            <TrackedLink
              href={`/${p.kind}/${p.id}`}
              event={EVENTS.HOME_POPULAR_CLICKED}
              params={{ kind: p.kind, rank: i + 1 }}
              className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-grey-50 transition-colors no-underline group"
            >
              {/* 순위 배지 — TOP 3 만 강조 */}
              <span
                className={`flex-shrink-0 w-5 h-5 rounded-full inline-flex items-center justify-center text-[11px] font-extrabold ${
                  i < 3
                    ? "bg-orange-50 text-orange-600"
                    : "bg-grey-50 text-grey-500"
                }`}
              >
                {i + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold text-grey-900 line-clamp-2 leading-[1.4] group-hover:text-blue-600 transition-colors">
                  {p.title}
                </span>
                <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] text-grey-600 mt-1">
                  <span className="inline-block px-1 py-px rounded bg-grey-100 text-[10px] font-semibold text-grey-700">
                    {p.kind === "welfare" ? "복지" : "대출"}
                  </span>
                  <span>{formatDeadline(p.apply_end)}</span>
                  <span className="text-grey-500">·</span>
                  <span>조회 {p.view_count.toLocaleString()}</span>
                </span>
              </span>
            </TrackedLink>
          </li>
        ))}
      </ol>

      {/* 비로그인 시 회원가입 CTA — 작은 풀 너비 푸터 */}
      {!isLoggedIn && (
        <TrackedLink
          href="/signup"
          event={EVENTS.HOME_POPULAR_SIGNUP_CTA}
          className="mt-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors no-underline border border-blue-100"
        >
          <span className="text-[12px] font-bold text-blue-700">
            회원가입하면 알림 받기
          </span>
          <span className="text-blue-500 text-[13px] font-bold">→</span>
        </TrackedLink>
      )}
    </aside>
  );
}
