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

// 마감일 → 사람 읽기 쉬운 D-X 문자열 (KST 기준)
// Vercel UTC 환경에서 KST 00:00~09:00 창 D-X 1일 어긋남 방지 — calendar-preview 동일 패턴.
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

export async function HomePopularPicks({ isLoggedIn }: { isLoggedIn: boolean }) {
  const picks = await getPopularPicks();
  if (picks.length === 0) return null;

  // 사이드 배너 박스 — max-w-[420px], 우측 정렬, 카드 콤팩트.
  // 모바일은 width 100% (centered), 데스크톱은 우측에 작게 노출.
  return (
    <section className="max-w-content mx-auto px-10 max-md:px-6 py-8 max-md:py-6">
      <aside
        className="ml-auto max-w-[420px] w-full rounded-2xl bg-white border border-grey-200 p-4 max-md:p-3"
        aria-labelledby="popular-picks-title"
      >
        <div className="flex items-baseline justify-between mb-3">
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
                className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-grey-50 transition-colors no-underline group"
              >
                {/* 순위 배지 — TOP 3 만 강조, 작게 */}
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
                  <span className="block text-[13px] font-semibold text-grey-900 truncate group-hover:text-blue-600 transition-colors">
                    {p.title}
                  </span>
                  <span className="block text-[11px] text-grey-600 mt-0.5">
                    <span className="inline-block px-1 py-px rounded bg-grey-100 text-[10px] font-semibold text-grey-700 mr-1.5 align-middle">
                      {p.kind === "welfare" ? "복지" : "대출"}
                    </span>
                    {formatDeadline(p.apply_end)}
                    <span className="text-grey-400 mx-1">·</span>
                    조회 {p.view_count.toLocaleString()}
                  </span>
                </span>
              </TrackedLink>
            </li>
          ))}
        </ol>

        {/* 비로그인 시 회원가입 CTA — 작은 풀 너비 푸터.
            TrackedLink 로 GA4 측정 (비로그인 funnel 직격, 사이드 배너 효과 추적). */}
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
    </section>
  );
}
