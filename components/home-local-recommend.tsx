// ============================================================
// 홈 페이지 — 내 지역 정책 섹션 (Phase C UI 강화)
// ============================================================
// 사장님 spec — 거주지 (예: 전남 순천시) 정책을 별도 강조 섹션으로 노출.
// district 정확 매칭 (welfare_programs/loan_programs.district = 사용자 district)
// 정책만 카드 5건 + "전체 보기" link.
//
// district NULL 사용자 (광역만 설정 또는 빈 프로필) → 섹션 자체 숨김.
// 사장님 (전남 순천) 47 welfare 매칭 → 즉시 노출 효과.
// ============================================================

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { UserSignals } from "@/lib/personalization/types";
import { RecommendLinkTracker } from "@/components/analytics/recommend-link-tracker";

// 카드에 표시할 정책 1건 — 최소 정보만
type LocalProgram = {
  id: string;
  title: string;
  href: string;
  source: string | null;
  apply_end: string | null;
  type: "welfare" | "loan";
};

async function loadLocalPrograms(
  region: string,
  district: string,
  limit: number,
): Promise<LocalProgram[]> {
  const supabase = await createClient();
  // 마감 안 지났거나 미설정인 정책만, district 정확 매칭.
  // welfare + loan 동시 query.
  const today = new Date().toISOString().slice(0, 10);

  const [welfareRes, loanRes] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("id, title, source, apply_end")
      .eq("district", district)
      .or(`apply_end.gte.${today},apply_end.is.null`)
      .order("apply_end", { ascending: true, nullsFirst: false })
      .limit(limit),
    supabase
      .from("loan_programs")
      .select("id, title, source, apply_end")
      .eq("district", district)
      .or(`apply_end.gte.${today},apply_end.is.null`)
      .order("apply_end", { ascending: true, nullsFirst: false })
      .limit(limit),
  ]);

  const welfare: LocalProgram[] = (welfareRes.data ?? []).map((w) => ({
    id: w.id,
    title: w.title,
    href: `/welfare/${w.id}`,
    source: w.source,
    apply_end: w.apply_end,
    type: "welfare",
  }));
  const loan: LocalProgram[] = (loanRes.data ?? []).map((l) => ({
    id: l.id,
    title: l.title,
    href: `/loan/${l.id}`,
    source: l.source,
    apply_end: l.apply_end,
    type: "loan",
  }));

  // 마감 임박순 정렬 (둘 다 같은 정렬 키 가짐)
  return [...welfare, ...loan]
    .sort((a, b) => {
      if (!a.apply_end && !b.apply_end) return 0;
      if (!a.apply_end) return 1;
      if (!b.apply_end) return -1;
      return a.apply_end.localeCompare(b.apply_end);
    })
    .slice(0, limit);
}

type Props = {
  signals: UserSignals;
};

export async function HomeLocalRecommend({ signals }: Props) {
  // district 미설정 → 섹션 숨김 (다른 사용자 화면 영향 0)
  if (!signals.district || !signals.region) return null;

  const programs = await loadLocalPrograms(signals.region, signals.district, 5);
  // 매칭 0건 → 섹션 숨김 (빈 영역 noise 0)
  if (programs.length === 0) return null;

  // 전체 카운트 별도 query — "47건 중 5건 보기" 같은 안내용
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ count: welfareCount }, { count: loanCount }] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("id", { count: "exact", head: true })
      .eq("district", signals.district)
      .or(`apply_end.gte.${today},apply_end.is.null`),
    supabase
      .from("loan_programs")
      .select("id", { count: "exact", head: true })
      .eq("district", signals.district)
      .or(`apply_end.gte.${today},apply_end.is.null`),
  ]);
  const totalCount = (welfareCount ?? 0) + (loanCount ?? 0);

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 sm:p-6 shadow-lg">
      {/* 헤더 — 카드1(맞춤 정책)과 동일 패턴: 제목+건수 / 전체 보기.
          기존 uppercase tracking 한글 라벨(자간만 벌어져 어색) 제거(2026-06-03). */}
      <div className="flex items-end justify-between gap-3 mb-1">
        <h2 className="text-base sm:text-lg font-bold text-grey-900">
          🏛️ {signals.region} {signals.district}
          <span className="ml-2 text-xs max-md:text-[13px] text-grey-500 font-normal">
            {totalCount}건
          </span>
        </h2>
        <Link
          href={`/recommend?district=${encodeURIComponent(signals.district)}`}
          className="text-xs max-md:text-[13px] text-blue-500 hover:text-blue-600 underline whitespace-nowrap"
        >
          전체 보기 →
        </Link>
      </div>
      <p className="mb-4 text-[13px] leading-[1.5] text-grey-600">
        내 지역에서 진행 중인 {totalCount}건 중 마감 임박 {programs.length}건을 먼저 보여드려요.
      </p>

      <ul className="space-y-2">
        {programs.map((p) => (
          <li key={`${p.type}-${p.id}`}>
            <RecommendLinkTracker
              programId={p.id}
              programTable={p.type === "welfare" ? "welfare_programs" : "loan_programs"}
              eventType="home_recommend_click"
              sourcePage="/"
              href={p.href}
              className="flex items-center justify-between gap-2 rounded-lg bg-white border border-grey-200 px-3 py-2 hover:border-blue-300 no-underline"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-grey-900 truncate">
                  {p.title}
                </div>
                <div className="text-[11px] text-grey-500 mt-0.5">
                  {p.type === "welfare" ? "복지" : "정책자금"}
                  {p.source ? ` · ${p.source}` : ""}
                  {p.apply_end ? ` · 마감 ${p.apply_end}` : ""}
                </div>
              </div>
              <span className="text-blue-600 text-sm whitespace-nowrap">→</span>
            </RecommendLinkTracker>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] text-grey-500">
        매일 새 보도자료에서 자동 수집됩니다.
      </p>
    </section>
  );
}
