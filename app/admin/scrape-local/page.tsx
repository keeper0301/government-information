// ============================================================
// /admin/scrape-local — Phase B 시·군 보도자료 수동 수집 페이지
// ============================================================
// 사장님 1 클릭 호출 + 최근 cron/manual 결과 + 누적 수집 통계.
//
// cron 가동: 매일 KST 09:00 (/api/cron/scrape-local-press).
// 시·군 추가 시 lib/scraping/local-press/_registry.ts 만 갱신 — UI 자동 반영.
// ============================================================

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ScrapeCityCard } from "./scrape-city-card";
import { MunicipalityCoverage } from "./municipality-coverage";
import {
  CITY_REGISTRY,
  type CityEntry,
} from "@/lib/scraping/local-press/_registry";

export const metadata: Metadata = {
  title: "시·군 보도자료 수집 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/scrape-local");
  if (!isAdminUser(user.email)) redirect("/");
}

type RecentRun = {
  city: string;
  trigger: string;
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
  createdAt: string;
};

// 시·군별 최근 수집 + news_posts 누적. cron audit 는 details.city 로,
// manual audit 는 details.ministry 로 식별 (1f837b8 회귀 fix 이후).
// N+1 회피: audit 1회 + news_posts ministry GROUP BY 1회.
async function loadCityStats(
  entries: CityEntry[],
): Promise<Record<string, { recent: RecentRun | null; total: number }>> {
  const admin = createAdminClient();

  // 최근 300건 audit 1회 조회 후 시·군별 분배.
  const { data: recentRows } = await admin
    .from("admin_actions")
    .select("details, created_at")
    .eq("action", "local_press_scrape")
    .order("created_at", { ascending: false })
    .limit(300);

  // news_posts ministry 1회 조회 — 모든 alias 합쳐서 in() 매칭 후 메모리 집계.
  const allMinistries = entries.flatMap((e) => [
    e.ministry,
    ...(e.ministryAliases ?? []),
  ]);
  // 2026-05-22 fix — Supabase 기본 1000 row cap 으로 ministry 일부 누락 사고.
  // news_posts 18,000+ row 중 in() 매칭 시 cap 에서 잘려 시·군 ministry 가 빠짐
  // → 누적 수집 0건 표시 사고. ministry column 만 가져오므로 가볍게 50,000 limit.
  const { data: postRows } = await admin
    .from("news_posts")
    .select("ministry")
    .in("ministry", allMinistries)
    .limit(50000);
  const countByMinistry = new Map<string, number>();
  for (const r of postRows ?? []) {
    const m = String((r as { ministry: string }).ministry ?? "");
    countByMinistry.set(m, (countByMinistry.get(m) ?? 0) + 1);
  }

  const results: Record<string, { recent: RecentRun | null; total: number }> =
    {};

  for (const entry of entries) {
    let recent: RecentRun | null = null;
    if (recentRows) {
      for (const row of recentRows) {
        const d = (row.details ?? {}) as Record<string, unknown>;
        const isMatch =
          d.city === entry.city || d.ministry === entry.ministry;
        if (isMatch) {
          recent = {
            city: entry.city,
            trigger: String(d.trigger ?? "—"),
            fetched: Number(d.fetched ?? 0),
            inserted: Number(d.inserted ?? 0),
            skipped: Number(d.skipped ?? 0),
            errors: Array.isArray(d.errors) ? (d.errors as string[]) : [],
            createdAt: String(row.created_at),
          };
          break;
        }
      }
    }

    const ministriesForEntry = [
      entry.ministry,
      ...(entry.ministryAliases ?? []),
    ];
    const total = ministriesForEntry.reduce(
      (sum, m) => sum + (countByMinistry.get(m) ?? 0),
      0,
    );

    results[entry.key] = { recent, total };
  }

  return results;
}

export default async function Page() {
  await requireAdmin();
  const stats = await loadCityStats(CITY_REGISTRY);

  const totalCount = CITY_REGISTRY.length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <AdminPageHeader
        kicker="ADMIN · 컨텐츠 발행"
        title={`시·군 보도자료 수집 (${totalCount} 시·군)`}
        description="Phase B — 시·군 단위 보도자료 외부 수집. 매일 KST 09:00 cron 자동 가동 + 1 클릭 수동 호출. press_ingest 가 KST 10:30 에 자동 분류."
      />

      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-relaxed text-slate-700">
        <p>
          📌 자동 가동: 매일 KST 09:00 (
          <code>/api/cron/scrape-local-press</code>). 수동 호출은 cron 외 즉시
          가져오기.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          수집된 보도자료는 <code>news_posts</code> 에 저장 → press_ingest cron
          (10:30 / 15:30 / 19:30) 이 자동 분류 → welfare / loan 자동 등록.
        </p>
      </div>

      <MunicipalityCoverage />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {CITY_REGISTRY.map((entry) => (
          <ScrapeCityCard
            key={entry.key}
            city={entry.key}
            cityLabel={entry.city}
            siteUrl={entry.siteUrl}
            ministry={entry.ministry}
            stats={stats[entry.key]}
          />
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600">
        <p className="mb-2 font-semibold text-slate-700">시·군 추가 안내</p>
        <p>
          신규 시·군은{" "}
          <code>lib/scraping/local-press/&#123;city&#125;.ts</code> 작성 후{" "}
          <code>lib/scraping/local-press/_registry.ts</code> 의 CITY_REGISTRY
          배열에 1줄 추가하면 cron + UI 모두 자동 반영됩니다.
        </p>
      </div>
    </div>
  );
}
