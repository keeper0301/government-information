// ============================================================
// 시·군 보도자료 collector 24h 통계 (5/17)
// ============================================================
// admin_actions 의 local_press_scrape audit 를 시·군별로 집계.
// autonomous hub 의 LocalPressCard 가 사용.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { CITY_REGISTRY } from "@/lib/scraping/local-press/_registry";

export type LocalPressCityStat = {
  city: string; // 한국어 이름
  inserted24h: number;
  fetched24h: number;
  errors24h: number;
  lastRunAt: string | null;
  lastError: string | null; // 마지막 audit 의 error 필드 (한 줄)
};

export type LocalPressStats = {
  totalInserted24h: number;
  totalFetched24h: number;
  totalErrors24h: number;
  cities: LocalPressCityStat[]; // CITY_REGISTRY 순서 유지
  lastCronAt: string | null;
};

export async function getLocalPressStats(): Promise<LocalPressStats> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: rows } = await admin
    .from("admin_actions")
    .select("details, created_at")
    .eq("action", "local_press_scrape")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  // city → 누적
  const byCity = new Map<
    string,
    {
      inserted: number;
      fetched: number;
      errors: number;
      lastRunAt: string | null;
      lastError: string | null;
    }
  >();

  let lastCronAt: string | null = null;

  for (const row of rows ?? []) {
    const d = (row.details ?? {}) as Record<string, unknown>;
    const city = String(d.city ?? "");
    if (!city) continue;
    const trigger = String(d.trigger ?? "");
    if (trigger === "cron" && !lastCronAt) {
      lastCronAt = String(row.created_at);
    }
    const inserted = Number(d.inserted ?? 0);
    const fetched = Number(d.fetched ?? 0);
    const errs = Array.isArray(d.errors) ? (d.errors as string[]) : [];
    const errFatal = d.error ? 1 : 0;
    const errCount = errs.length + errFatal;

    const prev = byCity.get(city);
    byCity.set(city, {
      inserted: (prev?.inserted ?? 0) + inserted,
      fetched: (prev?.fetched ?? 0) + fetched,
      errors: (prev?.errors ?? 0) + errCount,
      lastRunAt: prev?.lastRunAt ?? String(row.created_at),
      lastError:
        prev?.lastError ??
        (errFatal ? String(d.error) : errs[0] ?? null),
    });
  }

  const cities: LocalPressCityStat[] = CITY_REGISTRY.map((entry) => {
    const stat = byCity.get(entry.city);
    return {
      city: entry.city,
      inserted24h: stat?.inserted ?? 0,
      fetched24h: stat?.fetched ?? 0,
      errors24h: stat?.errors ?? 0,
      lastRunAt: stat?.lastRunAt ?? null,
      lastError: stat?.lastError ?? null,
    };
  });

  return {
    totalInserted24h: cities.reduce((s, c) => s + c.inserted24h, 0),
    totalFetched24h: cities.reduce((s, c) => s + c.fetched24h, 0),
    totalErrors24h: cities.reduce((s, c) => s + c.errors24h, 0),
    cities,
    lastCronAt,
  };
}
