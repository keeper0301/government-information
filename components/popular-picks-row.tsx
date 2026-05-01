// ============================================================
// 인기 정책 TOP 5 — 일반 섹션 (가로 그리드, 모든 viewport)
// ============================================================
// 1800px+ sidebar (PopularPicksAside) 와 별개로 AlertStrip 다음에
// 일반 섹션으로 노출. 모바일/태블릿/일반 데스크톱 사용자가 첫 화면 스크롤
// 직후 인기 정책을 즉시 클릭 가능. 세로 ol 이 아니라 가로 5 카드.
//
// dismiss 기능 X — 일반 섹션이라 매번 노출 (sidebar 와 분리 의도).
// ============================================================

import { Flame } from "lucide-react";
import Link from "next/link";
import { TrackedLink } from "./tracked-link";
import { EVENTS } from "@/lib/analytics";
import type { PopularPick } from "@/lib/popular-picks";

// 마감일 → 사람 읽기 쉬운 D-X (KST 기준). PopularPicksAside 와 동일 로직.
function formatDeadline(apply_end: string | null): string {
  if (!apply_end) return "상시";
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const todayKst = new Date(Date.now() + KST_OFFSET_MS);
  const todayY = todayKst.getUTCFullYear();
  const todayM = todayKst.getUTCMonth();
  const todayD = todayKst.getUTCDate();
  const today = new Date(Date.UTC(todayY, todayM, todayD));
  const end = new Date(apply_end);
  const endUtc = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
  );
  const days = Math.round(
    (endUtc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0) return "마감";
  if (days === 0) return "오늘 마감";
  if (days <= 7) return `D-${days}`;
  return `${endUtc.getUTCMonth() + 1}월 ${endUtc.getUTCDate()}일`;
}

export function PopularPicksRow({ picks }: { picks: PopularPick[] }) {
  if (picks.length === 0) return null;
  return (
    <section
      className="max-w-content mx-auto px-10 max-md:px-6 py-10 max-md:py-7"
      aria-labelledby="popular-row-title"
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2
          id="popular-row-title"
          className="text-[20px] md:text-[22px] font-extrabold text-grey-900 tracking-[-0.4px] inline-flex items-center gap-1.5"
        >
          <Flame className="w-5 h-5 text-orange-500" aria-hidden="true" />
          지금 인기있는 정책
        </h2>
        <Link
          href="/welfare?sort=popular"
          className="text-[13px] font-semibold text-blue-500 hover:text-blue-600 no-underline"
        >
          전체 →
        </Link>
      </div>
      {/* 5 카드 가로 그리드 — 데스크톱 5cols / 태블릿 3cols / 모바일 2cols */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {picks.map((p, i) => (
          <TrackedLink
            key={`${p.kind}-${p.id}`}
            href={`/${p.kind}/${p.id}`}
            event={EVENTS.HOME_POPULAR_CLICKED}
            params={{ kind: p.kind, rank: i + 1, surface: "row" }}
            className="group flex flex-col gap-2 rounded-2xl bg-white border border-grey-200 p-4 hover:border-blue-300 hover:shadow-[0_4px_12px_rgba(49,130,246,0.08)] transition-all no-underline"
          >
            <div className="flex items-center justify-between">
              <span
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-extrabold ${
                  i < 3
                    ? "bg-orange-50 text-orange-600"
                    : "bg-grey-50 text-grey-500"
                }`}
              >
                {i + 1}
              </span>
              <span className="text-[10px] font-semibold tracking-[0.04em] uppercase text-grey-500">
                {p.kind === "welfare" ? "복지" : "대출"}
              </span>
            </div>
            <p className="text-[14px] font-bold text-grey-900 line-clamp-2 leading-[1.4] group-hover:text-blue-600 transition-colors min-h-[40px]">
              {p.title}
            </p>
            <div className="flex items-center justify-between text-[11px] text-grey-600">
              <span>{formatDeadline(p.apply_end)}</span>
              <span>조회 {p.view_count.toLocaleString()}</span>
            </div>
          </TrackedLink>
        ))}
      </div>
    </section>
  );
}
