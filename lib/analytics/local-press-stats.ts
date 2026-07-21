// ============================================================
// 시·군 보도자료 collector 24h 통계 (5/17)
// ============================================================
// admin_actions 의 local_press_scrape audit 를 시·군별로 집계.
// autonomous hub 의 LocalPressCard 가 사용.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { CITY_REGISTRY } from "@/lib/scraping/local-press/_registry";
import {
  PLAYWRIGHT_CITY_REGISTRY,
  PC_ONLY_CITIES,
} from "@/lib/scraping/local-press/_playwright-city-registry";

// 프록시 경로(GitHub Actions + icn1)로 "실제 가동 중"인 시·군의 audit city 명 집합.
// audit details.city = import-press-batch 가 `ministry.replace(/청$/,"")` 로 기록(노원구청→노원구).
// stale 노쇼 감지용 — 이 목록에 없는 프록시 도시는 collector 가 완전히 죽어도(audit 0) 경보 사각.
//
// 2026-06-09 — 하드코딩 10개 목록을 PLAYWRIGHT_CITY_REGISTRY 파생으로 전환. registry 가
//   runner 단일 출처(= RUNNER_CITIES, 3곳 동기화를 registry-sync.test 가 보증)라, 도시 추가 때마다
//   여기 동기화를 빠뜨려 생기던 노쇼 사각지대(예: 6/8 평택·양천)를 근본 차단. 새 도시는 자동 편입.
// 2026-06-12 — PC 러너 전용(가정용 IP) 도시는 GHA 프록시 audit 이 없어(사장님 PC 수동 수집)
//   stale 노쇼 감지 대상이 아니다. 제외해야 self-heal(collector-health-diagnosis)·registry-sync
//   와 일관(아니면 중랑·강북이 영구 stale +2 로 LOCAL_PRESS_STALE_FLOOR baseline 오염).
const pcOnlyCities = new Set<string>(PC_ONLY_CITIES);
const PROXY_LOCAL_PRESS_CITIES = [
  ...new Set(
    Object.entries(PLAYWRIGHT_CITY_REGISTRY)
      .filter(([key]) => !pcOnlyCities.has(key))
      .map(([, c]) => c.ministry.replace(/청$/, "")),
  ),
];

export type LocalPressCityStat = {
  city: string; // 한국어 이름
  inserted24h: number;
  fetched24h: number;
  errors24h: number;
  // 2026-05-30: factory date 추출 실패 → published_at silent now-fallback 건수.
  // import-press-batch audit details.null_date 누적. NewsArticle schema 신뢰도 진단.
  nullDate24h: number;
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
      nullDate: number;
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
    const nullDateRow = Number(d.null_date ?? 0);
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
      nullDate: (prev?.nullDate ?? 0) + nullDateRow,
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
      nullDate24h: stat?.nullDate ?? 0,
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
      nullDate24h: stat.nullDate,
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

// 2026-05-30 — keepioo 의 index 가능 페이지 중 news (외부 원본) 비중. ≥0.6 시
// Google "Scaled content abuse" 정책 의심 신호 — keepioo USP (welfare/loan 정책 가이드)
// 대비 news 비중이 과도하면 AdSense 평가에서 "주요 목적이 외부 콘텐츠 자동 복제" 로
// 잘못 판정될 위험. 실제 /news/[slug] metadata 의 selective noindex 기준 중 DB count 로
// 안전하게 표현 가능한 summary+classified_at+ai_commentary 를 맞춰 계산한다.
export async function getNewsRatio(): Promise<{
  welfare: number;
  loan: number;
  blog: number;
  newsIndexable: number;
  ratio: number; // newsIndexable / 전체 (0~1)
  // 2026-05-30 P2 — newsIndexable 중 ai_commentary 채워진 비율 (백필 cron 진행률).
  // review mode off 직전 사장님 점검 신호. 1.0 도달 = sitemap 100% 진입 가능.
  commentaryBackfillRatio: number;
}> {
  const admin = createAdminClient();
  const [w, l, b, n, nc] = await Promise.all([
    admin.from("welfare_programs").select("id", { count: "exact", head: true }),
    admin.from("loan_programs").select("id", { count: "exact", head: true }),
    admin.from("blog_posts").select("id", { count: "exact", head: true }),
    admin
      .from("news_posts")
      .select("id", { count: "exact", head: true })
      .neq("category", "press")
      .not("summary", "is", null)
      .not("classified_at", "is", null)
      .not("ai_commentary", "is", null),
    admin
      .from("news_posts")
      .select("id", { count: "exact", head: true })
      .neq("category", "press")
      .not("summary", "is", null)
      .not("classified_at", "is", null)
      .not("ai_commentary", "is", null),
  ]);
  const welfare = w.count ?? 0;
  const loan = l.count ?? 0;
  const blog = b.count ?? 0;
  const newsIndexable = n.count ?? 0;
  const newsWithCommentary = nc.count ?? 0;
  const total = welfare + loan + blog + newsIndexable;
  const ratio = total > 0 ? newsIndexable / total : 0;
  const commentaryBackfillRatio =
    newsIndexable > 0 ? newsWithCommentary / newsIndexable : 0;
  return { welfare, loan, blog, newsIndexable, ratio, commentaryBackfillRatio };
}

// 2026-05-30 — health-alert silent → audible 세 번째 단계. 도시별 null_date 누적이
// threshold 넘는 시·군 수. factory date 추출 selector 깨졌거나 사이트 구조 변경 → 모든
// 글 published_at 이 now 로 silent fallback. NewsArticle schema 신뢰도 ↓ + 사용자 알림
// "오늘 새 정책" 거짓. 5+ 누적 = collector regex 점검 권장 강한 시그널.
export async function getHighNullDateCityCount(
  threshold = 5,
  windowHours = 24,
): Promise<number> {
  const admin = createAdminClient();
  const since = new Date(
    Date.now() - windowHours * 60 * 60 * 1000,
  ).toISOString();
  const { data: rows } = await admin
    .from("admin_actions")
    .select("details, created_at")
    .eq("action", "local_press_scrape")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  // city → latest audit null_date. This is a current-health signal: once a
  // collector's latest successful run extracts dates again, older fixed rows
  // inside the 24h window should not keep the alert stuck until they age out.
  const latestByCity = new Map<string, number>();
  for (const row of rows ?? []) {
    const d = (row.details ?? {}) as Record<string, unknown>;
    const city = String(d.city ?? "");
    if (!city || latestByCity.has(city)) continue;
    latestByCity.set(city, Number(d.null_date ?? 0));
  }
  let high = 0;
  for (const n of latestByCity.values()) if (n >= threshold) high += 1;
  return high;
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
