// ============================================================
// signals 부족 사용자 fallback 카드 (A 10차)
// ============================================================
// 매칭 0건 사용자에게 사이트 전체 30일 인기 정책 top N 노출.
// 빈 fallback UI 보다 가치 있는 정보 제공 (사장님 본인 화면 매일 체감).
// ============================================================

import Link from "next/link";
import { getTopPopularPrograms } from "@/lib/personalization/popularity-boost";
import { createClient } from "@/lib/supabase/server";

type PopularItem = {
  id: string;
  title: string;
  region: string | null;
  apply_end: string | null;
  table: "welfare_programs" | "loan_programs";
};

// 30일 popularity top 3 (welfare 2 + loan 1) — 빈 fallback 자리에 차분히 노출.
async function loadTopPopularItems(): Promise<PopularItem[]> {
  // welfare/loan 각각 top N 받기
  const [welfareTop, loanTop] = await Promise.all([
    getTopPopularPrograms("welfare_programs", 2),
    getTopPopularPrograms("loan_programs", 1),
  ]);

  const welfareIds = welfareTop.map((t) => t.id);
  const loanIds = loanTop.map((t) => t.id);

  // event 0 건이면 빈 list 반환 — caller 가 컴포넌트 자체 렌더 skip
  if (welfareIds.length === 0 && loanIds.length === 0) return [];

  const supabase = await createClient();
  const [welfareRows, loanRows] = await Promise.all([
    welfareIds.length > 0
      ? supabase
          .from("welfare_programs")
          .select("id, title, region, apply_end")
          .in("id", welfareIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; region: string | null; apply_end: string | null }> }),
    loanIds.length > 0
      ? supabase
          .from("loan_programs")
          .select("id, title, region, apply_end")
          .in("id", loanIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; region: string | null; apply_end: string | null }> }),
  ]);

  const items: PopularItem[] = [
    ...((welfareRows.data ?? []) as Array<{
      id: string;
      title: string;
      region: string | null;
      apply_end: string | null;
    }>).map((r) => ({ ...r, table: "welfare_programs" as const })),
    ...((loanRows.data ?? []) as Array<{
      id: string;
      title: string;
      region: string | null;
      apply_end: string | null;
    }>).map((r) => ({ ...r, table: "loan_programs" as const })),
  ];

  // A 11차: RLS soft-hide 추적 — popularity 가 잡은 id 중 anon RLS 로 가려진 건
  // (press-ingest pending_low 등) 모니터링. 일정 비율 이상이면 운영 점검 신호.
  const expectedCount = welfareIds.length + loanIds.length;
  if (items.length < expectedCount) {
    const hiddenCount = expectedCount - items.length;
    console.warn(
      `[top-popular-fallback] RLS soft-hide ${hiddenCount}/${expectedCount} 건 — id 추출 후 anon SELECT 에서 가려짐`,
    );
  }

  // popularity score 순서 보존 — welfareTop/loanTop 의 id 순서 그대로 정렬
  const orderMap = new Map<string, number>();
  welfareTop.forEach((t, i) => orderMap.set(t.id, i));
  loanTop.forEach((t, i) => orderMap.set(t.id, welfareTop.length + i));
  return items.sort(
    (a, b) => (orderMap.get(a.id) ?? 99) - (orderMap.get(b.id) ?? 99),
  );
}

// fallback section — 매칭 0건 사용자 화면에 "전체 사용자 인기 top 3" 자연 노출.
// event 0 건 (초기 상태) 이면 null 반환 → 기존 fallback UI 유지.
export async function TopPopularFallback() {
  const items = await loadTopPopularItems();
  if (items.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-grey-100">
      <h3 className="text-sm font-bold text-grey-700 mb-3 flex items-center gap-1.5">
        <span>🔥</span>
        <span>이번 달 인기 정책</span>
      </h3>
      <ul className="space-y-2">
        {items.map((item) => {
          const href =
            item.table === "welfare_programs"
              ? `/welfare/${item.id}`
              : `/loan/${item.id}`;
          return (
            <li key={item.id}>
              <Link
                href={href}
                className="block p-2.5 rounded-lg hover:bg-grey-50 no-underline transition-colors"
              >
                <div className="text-sm font-medium text-grey-900 line-clamp-1">
                  {item.title}
                </div>
                <div className="text-xs text-grey-500 mt-0.5">
                  {item.region ?? "전국"}
                  {item.apply_end && ` · 마감 ${item.apply_end}`}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
