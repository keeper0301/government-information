// ============================================================
// 홈 인기 정책 TOP 5 (Popular Picks) — 익명·로그인 모두 노출
// ============================================================
// view_count 기반 인기 정책 5건. 비로그인 사용자에게도 즉시 콘텐츠
// 노출 → 호기심 자극 + 회원가입 prompt.
//
// 발견 배경 (2026-04-28): 비로그인 사용자에게 노출되는 콘텐츠가
// HomeRecommendCard(입력 폼) 한 건만 → 즉시 가치 보여주는 부족.
// 24h 가입 0건 직격타.
//
// 동작:
//   - 마감 안 지난 welfare/loan 통합 view_count desc TOP 5
//   - WELFARE/LOAN_EXCLUDED_FILTER 동일 적용 (다른 페이지 일관)
//   - 회원가입 CTA 카드 끝에 추가 (비로그인 시만)
// ============================================================

import Link from "next/link";
import { Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  WELFARE_EXCLUDED_FILTER,
  LOAN_EXCLUDED_FILTER,
} from "@/lib/listing-sources";
import { TrackedLink } from "./tracked-link";
import { EVENTS } from "@/lib/analytics";

const LIMIT = 5;

interface PopularPick {
  id: string;
  title: string;
  view_count: number;
  apply_end: string | null;
  kind: "welfare" | "loan";
}

async function getPopularPicks(): Promise<PopularPick[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // welfare/loan 각각 LIMIT 만큼 가져와 합쳐서 view_count desc 재정렬
  const [welfareRes, loanRes] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("id, title, view_count, apply_end")
      .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
      .or(`apply_end.gte.${today},apply_end.is.null`)
      .gt("view_count", 0)
      .order("view_count", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("loan_programs")
      .select("id, title, view_count, apply_end")
      .not("source_code", "in", LOAN_EXCLUDED_FILTER)
      .or(`apply_end.gte.${today},apply_end.is.null`)
      .gt("view_count", 0)
      .order("view_count", { ascending: false })
      .limit(LIMIT),
  ]);

  const merged: PopularPick[] = [
    ...(welfareRes.data ?? []).map((w) => ({ ...w, kind: "welfare" as const })),
    ...(loanRes.data ?? []).map((l) => ({ ...l, kind: "loan" as const })),
  ];

  return merged
    .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
    .slice(0, LIMIT);
}

// 마감일 → 사람 읽기 쉬운 D-X 문자열
function formatDeadline(apply_end: string | null): string {
  if (!apply_end) return "상시 모집";
  const today = new Date();
  const end = new Date(apply_end);
  const days = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "오늘 마감";
  if (days <= 7) return `D-${days}`;
  return `${end.getMonth() + 1}월 ${end.getDate()}일 마감`;
}

export async function HomePopularPicks({ isLoggedIn }: { isLoggedIn: boolean }) {
  const picks = await getPopularPicks();
  if (picks.length === 0) return null;

  return (
    <section className="max-w-content mx-auto px-10 max-md:px-6 py-12 max-md:py-8">
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="text-[22px] md:text-[26px] font-extrabold text-grey-900 tracking-[-0.5px] inline-flex items-center gap-2">
          <Flame className="w-6 h-6 text-orange-500" aria-hidden="true" />
          지금 가장 많이 본 정책 TOP {picks.length}
        </h2>
        <Link
          href="/welfare?sort=popular"
          className="text-[14px] font-semibold text-blue-500 hover:text-blue-600 no-underline"
        >
          전체 보기 →
        </Link>
      </div>

      <ol className="grid gap-3">
        {picks.map((p, i) => (
          <li key={`${p.kind}-${p.id}`}>
            <TrackedLink
              href={`/${p.kind}/${p.id}`}
              event={EVENTS.HOME_POPULAR_CLICKED}
              params={{ kind: p.kind, rank: i + 1 }}
              className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-white border border-grey-200 hover:border-blue-400 hover:shadow-sm transition-all no-underline group"
            >
              {/* 순위 배지 — TOP 3 만 강조 */}
              <span
                className={`flex-shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center text-[14px] font-extrabold ${
                  i < 3
                    ? "bg-orange-50 text-orange-600"
                    : "bg-grey-50 text-grey-500"
                }`}
              >
                {i + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-grey-900 truncate group-hover:text-blue-600 transition-colors">
                  {p.title}
                </span>
                <span className="block text-[13px] text-grey-600 mt-0.5">
                  <span className="inline-block px-1.5 py-0.5 rounded bg-grey-100 text-[11px] font-semibold text-grey-700 mr-2 align-middle">
                    {p.kind === "welfare" ? "복지" : "대출"}
                  </span>
                  {formatDeadline(p.apply_end)}
                  <span className="text-grey-400 mx-1.5">·</span>
                  조회 {p.view_count.toLocaleString()}회
                </span>
              </span>
            </TrackedLink>
          </li>
        ))}

        {/* 비로그인 시 회원가입 CTA — 인기 카드 끝에 자연스럽게 prompt */}
        {!isLoggedIn && (
          <li>
            <Link
              href="/signup"
              className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors no-underline"
            >
              <span className="flex-shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center bg-blue-500 text-white text-[16px]">
                +
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-bold text-blue-700">
                  회원가입하면 내 조건에 맞는 정책 알림 받아요
                </span>
                <span className="block text-[13px] text-blue-600 mt-0.5">
                  무료 · 마감 7일 전 이메일 자동 발송
                </span>
              </span>
              <span className="text-blue-500 text-[18px] font-bold">→</span>
            </Link>
          </li>
        )}
      </ol>
    </section>
  );
}
