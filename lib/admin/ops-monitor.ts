// ============================================================
// /admin/ops-monitor — 어드민 자동화 #3 가동 효과 가시화 helper
// ============================================================
// 오늘 (2026-05-08) push 한 자동화 (광역 보도자료 4 layer fallback / dedupe 임계 점진 도입 W1 /
// news cap 100 / apply_url prompt 강화) 의 1주~30일 추세를 종합 페이지 한 곳에서 모니터링.
//
// 진단 스크립트 (scripts/diagnose-press-ingest.ts·analyze-llm-extraction.ts) 의 query 들을
// SSR 페이지로 통합 — 사장님 1 click 진입.
//
// 모든 query 는 try/catch + 0/null fallback — 페이지 로드 실패 보호.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
// 단일 source — pressUnclassified24h 정확 의미 (24h news_posts 광역 ∖ candidates)
// dashboard-alerts 와 임계 (≥30) 일관성 보장.
import { getPressIngestKpi } from "@/lib/press-ingest/filter";
// news cap 단일 source
import { NEWS_CLASSIFY_CAP_PER_CRON as NEWS_CAP_PER_CRON } from "@/lib/news-classify-config";

export type DailyCount = { day: string; count: number };

/** 7일 일별 카운트 — admin_actions 의 특정 action 만, KST 기준 day key */
async function fetchDailyAdminAction(
  action: string,
  days: number,
  actorIdNull: boolean,
): Promise<DailyCount[]> {
  const admin = createAdminClient();
  const since = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();
  let query = admin
    .from("admin_actions")
    .select("created_at")
    .eq("action", action)
    .gte("created_at", since);
  if (actorIdNull) query = query.is("actor_id", null);
  const { data, error } = await query;
  if (error || !data) {
    console.warn(`[ops-monitor] ${action} fetch 실패:`, error?.message);
    return emptyDays(days);
  }

  // KST 기준 day key 로 group
  const byDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    byDay.set(kstDay(d), 0);
  }
  for (const row of data as { created_at: string }[]) {
    const key = kstDay(new Date(row.created_at));
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  return Array.from(byDay, ([day, count]) => ({ day, count }));
}

function kstDay(d: Date): string {
  return d.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function emptyDays(days: number): DailyCount[] {
  const arr: DailyCount[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    arr.push({ day: kstDay(d), count: 0 });
  }
  return arr;
}

export type OpsMonitorSnapshot = {
  // dedupe (점진 도입 W1~W4)
  dedupeAutoConfirm7d: DailyCount[];
  dedupeReject7d: DailyCount[];
  dedupeThreshold: number; // 현재 임계 (env 또는 default 0.95)
  // 광역 보도자료 (4 layer fallback)
  pressAutoConfirm7d: DailyCount[];
  pressUnclassified24h: number; // dashboard 알림 카운트
  pressProvincePct: number; // 광역 매핑 의존도
  // news (cap 100)
  newsAutoHide7d: DailyCount[];
  newsBacklog24h: number; // 24h 미분류
  newsCap: number; // 현재 CAP_PER_CRON
  // 운영 안정성
  cronFailures7d: DailyCount[];
  // 마지막 갱신 시점 (KST)
  generatedAtKst: string;
};

/** /admin/ops-monitor 페이지 SSR — 모든 KPI 병렬 fetch. 일부 실패해도 0/null fallback. */
export async function getOpsMonitorSnapshot(): Promise<OpsMonitorSnapshot> {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // dedupe 임계 — env 또는 default 0.95 (route.ts 와 동일 가드)
  const dedupeThreshold = (() => {
    const raw = process.env.DEDUPE_AUTO_CONFIRM_THRESHOLD;
    if (!raw) return 0.95;
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed) || parsed < 0.5 || parsed > 1.0) return 0.95;
    return parsed;
  })();

  // press_ingest 통계 — getPressIngestKpi 재사용으로 dashboard-alerts 와 일관성 (≥30 임계 동일).
  // unclassified_24h: 24h news_posts 광역 매칭 ∖ press_ingest_candidates (cron 분류 안 된 것)
  const pressUnclassifiedQuery = (async () => {
    try {
      const kpi = await getPressIngestKpi();
      return kpi.unclassified_24h;
    } catch (e) {
      console.warn("[ops-monitor] press unclassified fetch 실패:", e);
      return 0;
    }
  })();

  // 광역 매핑 의존도 — 7일 confirmed candidates 의 apply_url 이 PROVINCE_DEFAULT_URLS 일치 비율
  const provincePctQuery = (async () => {
    try {
      const { PROVINCE_DEFAULT_URLS } = await import(
        "@/lib/press-ingest/province-default-urls"
      );
      const since7d = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data } = await admin
        .from("press_ingest_candidates")
        .select("classified_payload")
        .eq("status", "confirmed")
        .is("confirmed_by", null)
        .gte("confirmed_at", since7d);
      const provinceUrls = new Set(Object.values(PROVINCE_DEFAULT_URLS));
      const rows = (data ?? []) as Array<{
        classified_payload: { apply_url?: string | null } | null;
      }>;
      const total = rows.length;
      let provinceCount = 0;
      for (const r of rows) {
        const url = r.classified_payload?.apply_url;
        if (url && provinceUrls.has(url)) provinceCount += 1;
      }
      return total === 0 ? 0 : Math.round((provinceCount / total) * 100);
    } catch (e) {
      console.warn("[ops-monitor] province pct fetch 실패:", e);
      return 0;
    }
  })();

  // news 24h 미분류 backlog (news_posts WHERE classified_at IS NULL AND created_at < 24h 전)
  const newsBacklogQuery = (async () => {
    try {
      const { count } = await admin
        .from("news_posts")
        .select("id", { count: "exact", head: true })
        .is("classified_at", null)
        .lt("created_at", since24h);
      return count ?? 0;
    } catch (e) {
      console.warn("[ops-monitor] news backlog fetch 실패:", e);
      return 0;
    }
  })();

  // cron 실패 7일 — last_seen_at 기준 일별
  const cronFailures7dQuery = (async () => {
    try {
      const since7d = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data } = await admin
        .from("cron_failure_log")
        .select("last_seen_at")
        .gte("last_seen_at", since7d);
      const byDay = new Map<string, number>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        byDay.set(kstDay(d), 0);
      }
      for (const row of (data ?? []) as { last_seen_at: string }[]) {
        const key = kstDay(new Date(row.last_seen_at));
        if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
      }
      return Array.from(byDay, ([day, count]) => ({ day, count }));
    } catch (e) {
      console.warn("[ops-monitor] cron failures fetch 실패:", e);
      return emptyDays(7);
    }
  })();

  const [
    dedupeAutoConfirm7d,
    dedupeReject7d,
    pressAutoConfirm7d,
    pressUnclassified24h,
    pressProvincePct,
    newsAutoHide7d,
    newsBacklog24h,
    cronFailures7d,
  ] = await Promise.all([
    fetchDailyAdminAction("dedupe_auto_confirm", 7, true),
    fetchDailyAdminAction("dedupe_reject", 7, false),
    fetchDailyAdminAction("press_l2_confirm", 7, true),
    pressUnclassifiedQuery,
    provincePctQuery,
    fetchDailyAdminAction("news_auto_hide", 7, true),
    newsBacklogQuery,
    cronFailures7dQuery,
  ]);

  // news cap — cron route 의 단일 source 재사용 (동기화 위험 0)
  const newsCap = NEWS_CAP_PER_CRON;

  return {
    dedupeAutoConfirm7d,
    dedupeReject7d,
    dedupeThreshold,
    pressAutoConfirm7d,
    pressUnclassified24h,
    pressProvincePct,
    newsAutoHide7d,
    newsBacklog24h,
    newsCap,
    cronFailures7d,
    generatedAtKst: new Date().toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
    }),
  };
}
