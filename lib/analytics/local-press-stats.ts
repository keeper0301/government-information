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
  // 2026-05-25 — PC runner (사장님 PC 한국 IP fetch) 마지막 가동
  lastPcRunnerAt: string | null;
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
  let lastPcRunnerAt: string | null = null;

  for (const row of rows ?? []) {
    const d = (row.details ?? {}) as Record<string, unknown>;
    const city = String(d.city ?? "");
    if (!city) continue;
    const trigger = String(d.trigger ?? "");
    if (trigger === "cron" && !lastCronAt) {
      lastCronAt = String(row.created_at);
    }
    if (trigger === "pc_runner" && !lastPcRunnerAt) {
      lastPcRunnerAt = String(row.created_at);
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
    lastPcRunnerAt,
  };
}

// health-alert cron 이 호출. 최근 windowHours (기본 72h) 안에 inserted 한 적 없는
// 시·군 수를 반환. 3 cron 회차 연속 실패 = collector regex 깨졌거나 사이트 구조 변경 신호.
// audit 자체가 없는 시·군도 stale 로 처리 (cron 노쇼 진단 보조).
export async function getStaleCityCount(windowHours = 72): Promise<number> {
  const admin = createAdminClient();
  const since = new Date(
    Date.now() - windowHours * 60 * 60 * 1000,
  ).toISOString();

  const { data: rows } = await admin
    .from("admin_actions")
    .select("details")
    .eq("action", "local_press_scrape")
    .gte("created_at", since);

  // city → max inserted (한 번이라도 1+ 면 정상)
  const maxInsertedByCity = new Map<string, number>();
  for (const row of rows ?? []) {
    const d = (row.details ?? {}) as Record<string, unknown>;
    const city = String(d.city ?? "");
    if (!city) continue;
    const inserted = Number(d.inserted ?? 0);
    const prev = maxInsertedByCity.get(city) ?? 0;
    if (inserted > prev) maxInsertedByCity.set(city, inserted);
  }

  let stale = 0;
  for (const entry of CITY_REGISTRY) {
    if ((maxInsertedByCity.get(entry.city) ?? 0) === 0) {
      stale += 1;
    }
  }
  return stale;
}
