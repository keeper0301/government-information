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

import { PLAYWRIGHT_CITY_REGISTRY } from "@/lib/scraping/local-press/_playwright-city-registry";
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
  for (const cfg of Object.values(PLAYWRIGHT_CITY_REGISTRY)) {
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
