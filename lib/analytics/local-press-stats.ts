// ============================================================
// 시·군 보도자료 collector 24h 통계 (5/17)
// ============================================================
// admin_actions 의 local_press_scrape audit 를 시·군별로 집계.
// autonomous hub 의 LocalPressCard 가 사용.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { CITY_REGISTRY } from "@/lib/scraping/local-press/_registry";

// 프록시 경로(GitHub Actions + icn1)로 "실제 가동 중"(local-press-proxy.yml RUNNER_CITIES)인
// 시·군. audit details.city = ministry 에서 "청" 제거 값(노원구청→노원구). stale 노쇼 감지용.
// ※ suyeong/haeundae/busan 은 PLAYWRIGHT_CITY_REGISTRY 매핑에 있으나 RUNNER_CITIES 미포함=미가동
//   이라 제외(수집 안 하므로 stale 무의미). RUNNER_CITIES 에 도시 추가 시 여기도 동기화할 것.
const PROXY_LOCAL_PRESS_CITIES = [
  "노원구",
  "동래구",
  "부산진구",
  "금정구",
  "부산 북구",
  "사상구",
  "김포시",
  "성남시",
  "천안시",
  "안산시",
  "창원특례시",
];

export type LocalPressCityStat = {
  city: string; // 한국어 이름
  inserted24h: number;
  fetched24h: number;
  errors24h: number;
  lastRunAt: string | null;
  lastError: string | null; // 마지막 audit 의 error 필드 (한 줄)
  // 2026-05-26: 최근 errors 모두 (slice 20 까지). silent_fail 정확 진단.
  recentErrors: string[];
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
      recentErrors: string[];
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
    // recentErrors: 마지막 5건만 보존 (UI tooltip)
    const newRecent = [
      ...(prev?.recentErrors ?? []),
      ...(errFatal ? [String(d.error)] : []),
      ...errs,
    ].slice(0, 5);
    byCity.set(city, {
      inserted: (prev?.inserted ?? 0) + inserted,
      fetched: (prev?.fetched ?? 0) + fetched,
      errors: (prev?.errors ?? 0) + errCount,
      lastRunAt: prev?.lastRunAt ?? String(row.created_at),
      lastError:
        prev?.lastError ??
        (errFatal ? String(d.error) : errs[0] ?? null),
      recentErrors: newRecent,
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
      recentErrors: stat?.recentErrors ?? [],
    };
  });

  // 2026-05-29 — Playwright 프록시 경로(import-press-batch, trigger=proxy)로 이관한 시·군은
  // 정적 CITY_REGISTRY 에 없으므로, audit 에만 나타난 city 를 추가 표시(가시화).
  const registryCities = new Set(CITY_REGISTRY.map((e) => e.city));
  for (const [city, stat] of byCity) {
    if (registryCities.has(city)) continue;
    cities.push({
      city,
      inserted24h: stat.inserted,
      fetched24h: stat.fetched,
      errors24h: stat.errors,
      lastRunAt: stat.lastRunAt,
      lastError: stat.lastError,
      recentErrors: stat.recentErrors,
    });
  }

  return {
    totalInserted24h: cities.reduce((s, c) => s + c.inserted24h, 0),
    totalFetched24h: cities.reduce((s, c) => s + c.fetched24h, 0),
    totalErrors24h: cities.reduce((s, c) => s + c.errors24h, 0),
    cities,
    lastCronAt,
    lastPcRunnerAt,
  };
}

// health-alert cron 이 호출. 최근 windowHours (기본 72h) 안에 한 번도 fetched>0 한 적 없는
// 시·군 수를 반환(정적 CITY_REGISTRY + 프록시 도시). fetched 0 = collector 가 list/본문을 못
// 가져옴 = regex 깨짐·사이트 구조 변경·노쇼. (신규 없어 중복 skip 만 한 날은 fetched>0 라 정상.)
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

  // city → max fetched (한 번이라도 fetched 1+ 면 collector 동작 = 정상).
  // ※ inserted 가 아닌 fetched 기준: 신규 글이 없어 전부 중복 skip(inserted 0)이어도
  //   list/본문을 가져왔으면(fetched>0) collector 는 정상. inserted 0=stale 은 오발.
  const maxFetchedByCity = new Map<string, number>();
  for (const row of rows ?? []) {
    const d = (row.details ?? {}) as Record<string, unknown>;
    const city = String(d.city ?? "");
    if (!city) continue;
    const fetched = Number(d.fetched ?? 0);
    const prev = maxFetchedByCity.get(city) ?? 0;
    if (fetched > prev) maxFetchedByCity.set(city, fetched);
  }

  // 정적 CITY_REGISTRY + 프록시 경로(import-press-batch) 도시를 함께 stale 판정.
  // 프록시 도시가 완전히 죽으면(audit 0=노쇼) 감지하려면 정적 목록 필요(audit 기반만으론 노쇼 누락).
  const targets = new Set<string>(CITY_REGISTRY.map((e) => e.city));
  for (const c of PROXY_LOCAL_PRESS_CITIES) targets.add(c);

  let stale = 0;
  for (const city of targets) {
    if ((maxFetchedByCity.get(city) ?? 0) === 0) {
      stale += 1;
    }
  }
  return stale;
}
