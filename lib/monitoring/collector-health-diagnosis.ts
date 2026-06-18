// ============================================================
// 지역뉴스 collector 자가치유 감지 — 고장 진단 + 수리 제안 (W0 읽기전용)
// ============================================================
// 자가치유 시스템(agent diagnose)의 "눈"을 현재 23 GHA collector 전체로 확장.
// admin_actions.local_press_scrape audit 를 읽어 collector 별로 상태를 분류하고
// 추정 원인 + 수리 제안을 만든다. **prod 자동수정 0** — 사람이 텔레그램/agent
// 보고를 보고 수동 적용. (D-4 auto-fix 가 순천·광주 2곳·구 정적 regex 만 보던 갭 해소)
//
// 대상 collector 는 PLAYWRIGHT_CITY_REGISTRY(runner 단일 출처)에서 파생 —
// local-press-stats 의 PROXY_LOCAL_PRESS_CITIES 와 동일 기준(노쇼 사각 방지 일관).
// ============================================================

import {
  PLAYWRIGHT_CITY_REGISTRY,
  PC_ONLY_CITIES,
} from "@/lib/scraping/local-press/_playwright-city-registry";
import { createAdminClient } from "@/lib/supabase/admin";

// collector 상태 분류.
//  - healthy        : 신규 글 insert 됨 (정상 가동)
//  - healthy_no_new : list/본문은 가져왔으나 신규 0 (전부 중복 skip) = 발행 없음, 정상
//  - list_broken    : audit 는 있으나 fetched 0 = 목록 selector 깨짐/사이트 개편 의심
//  - body_fail      : list 는 되나 errors 동반 insert 0 = 본문 selector/insert 필드 문제
//  - no_audit       : 최근 audit 자체 없음 = cron 노쇼/GHA workflow 실패 의심
export type CollectorStatus =
  | "healthy"
  | "healthy_no_new"
  | "list_broken"
  | "body_fail"
  | "no_audit";

export type CollectorDiagnosis = {
  city: string; // audit details.city (ministry 에서 "청" 제거)
  sourceCode: string;
  status: CollectorStatus;
  fetched: number;
  inserted: number;
  errors: number;
  lastRunAt: string | null;
  cause: string; // 추정 원인 (한국어)
  suggestion: string; // 수리 제안 (한국어)
};

// 진단 입력 — admin_actions.local_press_scrape 의 details 에서 추린 행.
export type ScrapeAuditRow = {
  city: string;
  fetched: number;
  inserted: number;
  errors: number; // details.errors(배열) 길이 + details.error(치명) 1
  createdAt: string;
};

// 진단 대상 collector — registry 에서 파생(city = ministry - "청"). 같은 city 두
// collector(사상구 알림+소식지)는 audit 가 같은 city 로 기록되므로 dedupe.
export type ExpectedCollector = { city: string; sourceCode: string };

export function expectedCollectorsFromRegistry(): ExpectedCollector[] {
  const seen = new Set<string>();
  const out: ExpectedCollector[] = [];
  const pcOnly = new Set<string>(PC_ONLY_CITIES);
  for (const [key, cfg] of Object.entries(PLAYWRIGHT_CITY_REGISTRY)) {
    if (pcOnly.has(key)) continue; // PC 러너 전용 — GHA audit 대상 아님(self-heal 제외)
    const city = cfg.ministry.replace(/청$/, "");
    if (seen.has(city)) continue; // 같은 city 중복(사상구) 1회만
    seen.add(city);
    out.push({ city, sourceCode: cfg.sourceCode });
  }
  return out;
}

// 문제 상태(사람 점검 필요) 여부. healthy/healthy_no_new 는 정상.
export function isProblemStatus(s: CollectorStatus): boolean {
  return s === "no_audit" || s === "list_broken" || s === "body_fail";
}

// city 별 audit 합산 + 분류. expected 미지정 시 registry 파생 전체.
export function diagnoseCollectors(
  auditRows: ScrapeAuditRow[],
  expected: ExpectedCollector[] = expectedCollectorsFromRegistry(),
): CollectorDiagnosis[] {
  // city → 합산 (24h window 안 여러 cron run 누적)
  const byCity = new Map<
    string,
    { fetched: number; inserted: number; errors: number; lastRunAt: string | null }
  >();
  for (const row of auditRows) {
    if (!row.city) continue;
    const prev = byCity.get(row.city);
    byCity.set(row.city, {
      fetched: (prev?.fetched ?? 0) + row.fetched,
      inserted: (prev?.inserted ?? 0) + row.inserted,
      errors: (prev?.errors ?? 0) + row.errors,
      // 최신 run 시각 (audit 는 최신순 가정 안 하므로 max 비교)
      lastRunAt:
        !prev?.lastRunAt || row.createdAt > prev.lastRunAt
          ? row.createdAt
          : prev.lastRunAt,
    });
  }

  return expected.map(({ city, sourceCode }) => {
    const agg = byCity.get(city);
    const fetched = agg?.fetched ?? 0;
    const inserted = agg?.inserted ?? 0;
    const errors = agg?.errors ?? 0;
    const lastRunAt = agg?.lastRunAt ?? null;

    let status: CollectorStatus;
    let cause: string;
    let suggestion: string;

    if (!agg) {
      status = "no_audit";
      cause = "최근 24h 수집 audit 없음 (GHA cron 노쇼 또는 workflow 실패 의심)";
      suggestion = `GHA local-press-proxy.yml 최근 run 확인 + KEEPIOO_RUNNER_CITIES 에 ${sourceCode} 등록 확인`;
    } else if (fetched === 0) {
      status = "list_broken";
      cause = "audit 는 있으나 목록 매칭 0건 (사이트 개편 또는 list selector 변경 의심)";
      suggestion = `playwright/lib/cities.mjs 의 ${city} listSelectors 사이트 HTML 대조 재확인`;
    } else if (inserted === 0 && errors > 0) {
      status = "body_fail";
      cause = "목록은 가져왔으나 errors 동반 insert 0 (본문 selector 또는 insert 필드 문제)";
      suggestion = `${city} bodySelectors / import-press-batch 필드(slug·source_id) 재확인`;
    } else if (inserted === 0) {
      status = "healthy_no_new";
      cause = "목록/본문 정상, 신규 발행 없음(전부 중복 skip) — 정상";
      suggestion = "조치 불요";
    } else {
      status = "healthy";
      cause = "신규 글 정상 수집";
      suggestion = "조치 불요";
    }

    return { city, sourceCode, status, fetched, inserted, errors, lastRunAt, cause, suggestion };
  });
}

// audit(admin_actions.local_press_scrape) 를 읽어 진단 반환 (DB read).
// diagnose 질문 핸들러 + health-check getHealthSignals 공용(DRY). windowHours 기본 24.
export async function getCollectorDiagnoses(
  windowHours = 24,
): Promise<CollectorDiagnosis[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - windowHours * 3_600_000).toISOString();
  const { data } = await admin
    .from("admin_actions")
    .select("details, created_at")
    .eq("action", "local_press_scrape")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const rows: ScrapeAuditRow[] = (
    (data ?? []) as { details: unknown; created_at: string }[]
  ).map((row) => {
    const d = (row.details ?? {}) as Record<string, unknown>;
    const errs = Array.isArray(d.errors) ? d.errors.length : 0;
    return {
      city: String(d.city ?? ""),
      fetched: Number(d.fetched ?? 0),
      inserted: Number(d.inserted ?? 0),
      errors: errs + (d.error ? 1 : 0),
      createdAt: String(row.created_at),
    };
  });
  return diagnoseCollectors(rows);
}

// ============================================================
// 지속적 silent insert-stop 감지 (회귀 전용) — 2026-06-10
// ============================================================
// "목록은 가져오는데(fetched>0) 신규 insert 가 끊긴" collector. 단 동작구 교훈(단일
// blip ≠ 고장) 반영해 **회귀(이전엔 됐는데 최근 끊김)만** 잡는다:
//   recent(기본 5일) inserted=0 + 활동(fetched>0) ≥3일 + baseline(이전 14일) inserted>0.
// → 동작구(최근에도 insert>0)·금정/광주남구(원래부터 0=저발행/이관불가)는 자동 제외(ignore 불요).
// 본문 추출 silent fail(목록 OK·본문 <250 필터) 또는 BODY_MIN_LEN 250 예고된 급감 감지용.

// city 별 recent/baseline 집계 (async fetcher 가 날짜로 분리해 채움).
export type CityInsertStat = {
  city: string;
  recentActiveDays: number; // recent 창에서 fetched>0 였던 distinct 일수
  recentInserted: number; // recent 창 insert 합
  baselineInserted: number; // baseline 창 insert 합 (이전에 작동했는지)
  latestFetched: string | null; // recent 창 audit 의 가져온 글 최신 발행일(triage 용)
};

export type InsertStopFlag = {
  city: string;
  recentActiveDays: number;
  baselineInserted: number;
  latestFetched: string | null;
};

// 회귀형 insert-stop 만 flag (순수). minActiveDays 기본 3.
export function flagInsertStops(
  stats: CityInsertStat[],
  { minActiveDays = 3 }: { minActiveDays?: number } = {},
): InsertStopFlag[] {
  return stats
    .filter(
      (s) =>
        s.recentInserted === 0 && // 최근 신규 0
        s.recentActiveDays >= minActiveDays && // 그래도 목록은 꾸준히 가져옴(list OK)
        s.baselineInserted > 0, // 이전엔 작동(=회귀, 원래 0인 저발행/이관불가 제외)
    )
    .map((s) => ({
      city: s.city,
      recentActiveDays: s.recentActiveDays,
      baselineInserted: s.baselineInserted,
      latestFetched: s.latestFetched,
    }));
}

// auto-triage (순수) — flag 중 "사이트에 DB 보다 새 글이 있는"(진짜 버그)만 남기고, "새 글
// 없음(정상)" 은 suppress. dbLatestByCity = city → news_posts 최신 published 날짜(YYYY-MM-DD).
//   latestFetched > dbLatest → 사이트 최신글이 DB 에 없음 = 본문 silent fail/수집실패(keep).
//   latestFetched ≤ dbLatest → 가져온 게 다 DB 에 있음 = 새 글 없음(suppress, 오탐 제거).
//   latestFetched 또는 dbLatest null → triage 불가 → 보수적 keep(오감지 방지보다 미탐 방지).
export function triageFlags(
  flags: InsertStopFlag[],
  dbLatestByCity: Record<string, string | null>,
): InsertStopFlag[] {
  return flags.filter((f) => {
    const dbLatest = dbLatestByCity[f.city] ?? null;
    if (!f.latestFetched || !dbLatest) return true; // 데이터 부족 → keep(보수적)
    return f.latestFetched > dbLatest; // 사이트 최신 > DB 최신 = 진짜 버그만 keep
  });
}

// audit 를 읽어 회귀형 insert-stop 반환 (DB read). recent/baseline 분리는 created_at age 로.
export async function getSustainedInsertStops({
  recentDays = 5,
  baselineDays = 14,
  minActiveDays = 3,
}: { recentDays?: number; baselineDays?: number; minActiveDays?: number } = {}): Promise<
  InsertStopFlag[]
> {
  const admin = createAdminClient();
  const totalDays = recentDays + baselineDays;
  const sinceMs = Date.now() - totalDays * 86_400_000;
  const recentCutoffMs = Date.now() - recentDays * 86_400_000;
  const { data } = await admin
    .from("admin_actions")
    .select("details, created_at")
    .eq("action", "local_press_scrape")
    .gte("created_at", new Date(sinceMs).toISOString());

  // city → { recentInserted, baselineInserted, recentActiveDays(set), latestFetched }
  const agg = new Map<
    string,
    {
      recentInserted: number;
      baselineInserted: number;
      recentActiveDays: Set<string>;
      latestFetched: string | null;
    }
  >();
  // audit 에 직접 기록된 city → source_code (정적 cron 이 details.source_code 로 남김).
  // 이전엔 city→source_code 를 playwright registry 에서만 파생해 정적 collector 가 누락
  // (dbLatest=null → 항상 보수적 keep = 헛경보)됐다. audit 의 source_code 로 그 갭을 메운다.
  const auditSourceCodeByCity = new Map<string, string>();
  for (const row of (data ?? []) as { details: unknown; created_at: string }[]) {
    const d = (row.details ?? {}) as Record<string, unknown>;
    const city = String(d.city ?? "");
    if (!city) continue;
    if (typeof d.source_code === "string" && d.source_code)
      auditSourceCodeByCity.set(city, d.source_code);
    const fetched = Number(d.fetched ?? 0);
    const inserted = Number(d.inserted ?? 0);
    const ts = new Date(row.created_at).getTime();
    const cur =
      agg.get(city) ??
      {
        recentInserted: 0,
        baselineInserted: 0,
        recentActiveDays: new Set<string>(),
        latestFetched: null,
      };
    if (ts >= recentCutoffMs) {
      cur.recentInserted += inserted;
      if (fetched > 0) cur.recentActiveDays.add(row.created_at.slice(0, 10)); // UTC 일자 키(분리만 목적)
      // recent 창 audit 의 latest_fetched 최댓값(triage 용). 구 audit 엔 없어 null.
      const lf = typeof d.latest_fetched === "string" ? d.latest_fetched : null;
      if (lf && (!cur.latestFetched || lf > cur.latestFetched)) cur.latestFetched = lf;
    } else {
      cur.baselineInserted += inserted;
    }
    agg.set(city, cur);
  }

  const stats: CityInsertStat[] = [...agg.entries()].map(([city, v]) => ({
    city,
    recentActiveDays: v.recentActiveDays.size,
    recentInserted: v.recentInserted,
    baselineInserted: v.baselineInserted,
    latestFetched: v.latestFetched,
  }));
  const flags = flagInsertStops(stats, { minActiveDays });
  if (flags.length === 0) return flags;

  // auto-triage — flag collector 의 DB 최신 published 날짜를 news_posts 에서 조회해, 사이트 최신
  // (latestFetched) 이 DB 보다 새 게 없으면 "발행 없음(정상)" 으로 suppress(오탐 제거).
  // city→sourceCode: playwright registry 파생 + audit 에 기록된 source_code(정적 cron) 보강.
  // audit 값이 더 직접적이라 우선(registry 에 없는 정적 도시도 이걸로 매핑됨).
  const cityToCode = new Map(
    expectedCollectorsFromRegistry().map((c) => [c.city, c.sourceCode]),
  );
  for (const [city, code] of auditSourceCodeByCity) cityToCode.set(city, code);
  const codes = flags.map((f) => cityToCode.get(f.city)).filter(Boolean) as string[];
  const dbLatestByCity: Record<string, string | null> = {};
  if (codes.length > 0) {
    const { data: posts } = await admin
      .from("news_posts")
      .select("source_code, published_at")
      .in("source_code", codes)
      .order("published_at", { ascending: false });
    const latestByCode = new Map<string, string>();
    for (const p of (posts ?? []) as { source_code: string; published_at: string }[]) {
      if (!latestByCode.has(p.source_code))
        // ⚠️ KST 로 slice — published_at 은 `YYYY-MM-DDT00:00:00+09:00` 라 UTC slice 시
        // 하루 빠르게(예 5/29 KST → "2026-05-28") 나온다. latestFetched(사이트 KST 날짜)와
        // 비교하므로 KST 로 맞춰야 한다. UTC slice 면 idle collector 가 항상 1일 off 로
        // false keep(오탐) — 성북 매일 false ⚠️ 원인(2026-06-12 fix).
        latestByCode.set(
          p.source_code,
          new Date(new Date(p.published_at).getTime() + 9 * 3600_000)
            .toISOString()
            .slice(0, 10),
        );
    }
    for (const f of flags) {
      const code = cityToCode.get(f.city);
      dbLatestByCity[f.city] = code ? latestByCode.get(code) ?? null : null;
    }
  }
  return triageFlags(flags, dbLatestByCity);
}

// 회귀형 insert-stop 텔레그램 포맷. 없으면 "".
export function formatInsertStops(flags: InsertStopFlag[]): string {
  if (flags.length === 0) return "";
  const lines = ["", `🔇 지역뉴스 신규수집 끊김 (${flags.length}건, 목록OK·신규0 지속):`];
  for (const f of flags.slice(0, 8)) {
    lines.push(
      `  ${f.city} — 최근 ${f.recentActiveDays}일 목록은 수집되나 신규 0 (이전 ${f.baselineInserted}건 → 회귀).`,
    );
    lines.push("     본문 추출(<250자 필터)·사이트 본문구조·BODY_MIN_LEN 점검");
  }
  return lines.join("\n");
}

// ============================================================
// cron 완주(cadence) 저하 감지 — 2026-06-10
// ============================================================
// keepioo 모니터링은 "무엇이 수집됐나(DB)"만 보고 "cron 이 끝까지 돌았나"는 안 봐서,
// GHA timeout(15분 cancel)으로 뒷순서 도시가 몇 주간 누락된 게 안 보였음(2026-06-09 발견).
// → GitHub API 없이 **audit run 수만으로** cron 완주를 감지: 각 collector 의 최근 실행
// 빈도를 자기 baseline 과 비교해 급락(timeout/부분실패)을 잡는다. insert-stop 과 동일한
// baseline 비교 패턴이라 cadence 가 다른 collector(GHA 2회/일 vs 정적 1회/일)도 자동 대응.

export type CityCadence = {
  city: string;
  recentRuns: number;
  recentDays: number;
  baselineRuns: number;
  baselineDays: number;
};

export type CadenceFlag = {
  city: string;
  recentPerDay: number;
  baselinePerDay: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// 실행빈도 급락만 flag (순수). 이전 ≥minBaselinePerDay 회/일 운영하던 collector 가
// 최근 baseline 의 maxDropRatio 배 미만으로 떨어지면 = cron 완주 저하(timeout/부분실패).
export function flagCadenceRegressions(
  stats: CityCadence[],
  {
    minBaselinePerDay = 1,
    maxDropRatio = 0.5,
  }: { minBaselinePerDay?: number; maxDropRatio?: number } = {},
): CadenceFlag[] {
  const out: CadenceFlag[] = [];
  for (const s of stats) {
    const recentPerDay = s.recentDays > 0 ? s.recentRuns / s.recentDays : 0;
    const baselinePerDay = s.baselineDays > 0 ? s.baselineRuns / s.baselineDays : 0;
    if (
      baselinePerDay >= minBaselinePerDay && // 이전엔 꾸준히 돌던 collector(저빈도/신규 제외)
      recentPerDay < baselinePerDay * maxDropRatio // 최근 빈도 절반 이하로 급락
    ) {
      out.push({
        city: s.city,
        recentPerDay: round2(recentPerDay),
        baselinePerDay: round2(baselinePerDay),
      });
    }
  }
  return out;
}

// audit run 수를 읽어 cadence 급락 반환 (DB read). recent/baseline 은 created_at age 로 분리.
export async function getCadenceRegressions({
  recentDays = 3,
  baselineDays = 11,
  minBaselinePerDay = 1,
  maxDropRatio = 0.5,
}: {
  recentDays?: number;
  baselineDays?: number;
  minBaselinePerDay?: number;
  maxDropRatio?: number;
} = {}): Promise<CadenceFlag[]> {
  const admin = createAdminClient();
  const totalDays = recentDays + baselineDays;
  const sinceMs = Date.now() - totalDays * 86_400_000;
  const recentCutoffMs = Date.now() - recentDays * 86_400_000;
  const { data } = await admin
    .from("admin_actions")
    .select("details, created_at")
    .eq("action", "local_press_scrape")
    .gte("created_at", new Date(sinceMs).toISOString());

  const agg = new Map<string, { recentRuns: number; baselineRuns: number }>();
  for (const row of (data ?? []) as { details: unknown; created_at: string }[]) {
    const city = String((row.details as Record<string, unknown>)?.city ?? "");
    if (!city) continue;
    const cur = agg.get(city) ?? { recentRuns: 0, baselineRuns: 0 };
    if (new Date(row.created_at).getTime() >= recentCutoffMs) cur.recentRuns += 1;
    else cur.baselineRuns += 1;
    agg.set(city, cur);
  }

  const stats: CityCadence[] = [...agg.entries()].map(([city, v]) => ({
    city,
    recentRuns: v.recentRuns,
    recentDays,
    baselineRuns: v.baselineRuns,
    baselineDays,
  }));
  return flagCadenceRegressions(stats, { minBaselinePerDay, maxDropRatio });
}

// cron cadence 급락 텔레그램 포맷. 없으면 "".
export function formatCadenceRegressions(flags: CadenceFlag[]): string {
  if (flags.length === 0) return "";
  const lines = ["", `⏱ 지역뉴스 cron 완주 저하 (${flags.length}건, 실행빈도 급락):`];
  for (const f of flags.slice(0, 8)) {
    lines.push(
      `  ${f.city} — 최근 ${f.recentPerDay}회/일 (이전 ${f.baselinePerDay}회/일 → 급락).`,
    );
    lines.push("     GHA local-press-proxy run cancelled? + timeout-minutes / 도시별 에러 점검");
  }
  return lines.join("\n");
}

// 문제 collector 만 텔레그램/agent 보고용으로 포맷. 정상은 제외(noise ↓).
export function formatCollectorProblems(diagnoses: CollectorDiagnosis[]): string {
  const problems = diagnoses.filter((d) => isProblemStatus(d.status));
  if (problems.length === 0) return "";
  const icon: Record<CollectorStatus, string> = {
    no_audit: "🚫",
    list_broken: "🔧",
    body_fail: "📄",
    healthy: "✅",
    healthy_no_new: "✅",
  };
  const lines = ["", `🩺 지역뉴스 collector 점검 (문제 ${problems.length}건):`];
  for (const p of problems.slice(0, 8)) {
    lines.push(`  ${icon[p.status]} ${p.city} — ${p.cause}`);
    lines.push(`     제안: ${p.suggestion}`);
  }
  return lines.join("\n");
}
