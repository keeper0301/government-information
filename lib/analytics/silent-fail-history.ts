// ============================================================
// silent_fail 추세 분석 (2026-05-26)
// ============================================================
// admin_actions 의 local_press_scrape audit 에서 silent_fail 패턴 추출.
//
// silent_fail 정의:
//   - fetched > 0 + inserted = 0 + skipped < fetched (일부 detail fail)
//   - 또는 fetched > 0 + errors > 0 (detail fetch error)
//
// 사용: /admin/silent-fail-history page
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/paginate";

export type SilentFailDay = {
  date: string; // YYYY-MM-DD (KST)
  silentFailCount: number;
  totalRuns: number;
  topCities: string[]; // 그날 silent_fail 시·군 목록 (max 5)
};

export type SilentFailHistoryStats = {
  days: SilentFailDay[]; // 최근 7일
  cityTotals: Array<{ city: string; count: number }>; // 시·군별 누적 (1주)
  totalRuns: number;
  totalSilentFails: number;
};

export async function getSilentFailHistory(
  days = 7,
): Promise<SilentFailHistoryStats> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // PostgREST max 1000행 — 7일 audit 이 1000 을 넘으면 silent_fail 추세가 과소 집계된다
  // (코드리뷰 예방). .range() 페이지네이션 전량 수집.
  const { rows } = await fetchAllRows<{ details: unknown; created_at: string }>((from, to) =>
    admin
      .from("admin_actions")
      .select("details, created_at")
      .eq("action", "local_press_scrape")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );

  // KST 날짜별 + 시·군별 누적
  const byDay = new Map<
    string,
    { count: number; total: number; cities: Set<string> }
  >();
  const byCity = new Map<string, number>();
  let totalRuns = 0;
  let totalSilentFails = 0;

  for (const row of rows ?? []) {
    const d = (row.details ?? {}) as Record<string, unknown>;
    const city = String(d.city ?? "");
    const fetched = Number(d.fetched ?? 0);
    const inserted = Number(d.inserted ?? 0);
    const skipped = Number(d.skipped ?? 0);
    const errors = Array.isArray(d.errors) ? (d.errors as string[]) : [];

    // KST 날짜 (UTC + 9h)
    const kstDate = new Date(
      new Date(String(row.created_at)).getTime() + 9 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);

    totalRuns += 1;

    // silent_fail 판정
    const isSilentFail =
      fetched > 0 &&
      inserted === 0 &&
      (skipped < fetched || errors.length > 0);

    const dayPrev = byDay.get(kstDate) ?? {
      count: 0,
      total: 0,
      cities: new Set<string>(),
    };
    dayPrev.total += 1;
    // 2026-05-26 review important: city 빈 string 가드 (round1 audit 등 city 누락 case)
    if (isSilentFail && city) {
      dayPrev.count += 1;
      dayPrev.cities.add(city);
      totalSilentFails += 1;
      byCity.set(city, (byCity.get(city) ?? 0) + 1);
    }
    byDay.set(kstDate, dayPrev);
  }

  // 전체 range 표시 (audit 없는 날도 0). 90일 범위 max.
  const dayList: SilentFailDay[] = [];
  const maxDays = Math.min(days, 90);
  for (let i = maxDays - 1; i >= 0; i--) {
    const target = new Date(Date.now() - i * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const stat = byDay.get(target);
    dayList.push({
      date: target,
      silentFailCount: stat?.count ?? 0,
      totalRuns: stat?.total ?? 0,
      // 2026-05-26 — Set insertion order 의존성 제거 (cron 순서 변동 시 day 별 시각 다름) → localeCompare
      topCities: Array.from(stat?.cities ?? []).sort((a, b) => a.localeCompare(b)).slice(0, 5),
    });
  }

  // 2026-05-26 review nit: count 동률 시 city localeCompare → 매번 동일 순서 (검수 추적 안정)
  const cityTotals = Array.from(byCity.entries())
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return a.city.localeCompare(b.city);
    });

  return {
    days: dayList,
    cityTotals,
    totalRuns,
    totalSilentFails,
  };
}
