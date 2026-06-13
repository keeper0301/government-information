// ============================================================
// 자율운영 시각화 — 데이터 집계 (상태판 + 활동 시계열)
// ============================================================
// /admin/autonomous/overview 전용. 기존 90KB 허브와 독립.
// admin_actions(cron 발화 흔적) + news_posts/blog_posts(산출물)에서 집계.
//
// 비용 주의: agent_diagnose 류는 시간당 수백 건이라 전체 fetch 가 비쌈.
//   → 상태판은 시스템별 "최신 1건(limit 1)" + "24h head-count" 만 (가벼운 쿼리).
//   → 시계열은 news_posts/blog_posts created_at 만 fetch(중간 규모) 후 JS 버킷.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// 자율운영 시스템 정의 — 각 시스템은 여러 admin_actions action 으로 측정.
// expectHours: 이 시간 안에 발화했으면 정상(녹). 2배까지 주의(황). 초과 빨강.
export type SystemDef = {
  key: string;
  label: string;
  actions: string[];
  expectHours: number;
};

export const AUTONOMOUS_SYSTEMS: SystemDef[] = [
  { key: "collect", label: "데이터 수집", actions: ["collect_run", "local_press_scrape_run", "naver_news_collect_run"], expectHours: 26 },
  { key: "classify", label: "분류·정제", actions: ["news_classify_run", "press_ingest_run", "press_l2_classify"], expectHours: 26 },
  { key: "publish", label: "콘텐츠 발행", actions: ["blog_publish_run", "sns_publish_run"], expectHours: 26 },
  { key: "instagram", label: "인스타 발행", actions: ["instagram_publish_success", "instagram_publish_skipped"], expectHours: 30 },
  { key: "agent", label: "자율 진단·실행", actions: ["agent_diagnose_run", "agent_execute_run"], expectHours: 4 },
  { key: "monitor", label: "감시·알림", actions: ["health_alert_run", "external_console_check_run", "silent_fail_detect_run"], expectHours: 30 },
  { key: "learn", label: "자가 학습(주간)", actions: ["self_learning_digest_run", "popularity_weights_tune_run", "push_time_learn_run"], expectHours: 192 },
  { key: "push", label: "푸시 발송", actions: ["push_send_run"], expectHours: 3 },
];

export type SystemStatus = {
  key: string;
  label: string;
  lastFiredIso: string | null;
  hoursAgo: number | null;
  count24h: number;
  state: "green" | "yellow" | "red";
};

export type DayBucket = { day: string; count: number };

export type OverviewMetrics = {
  systems: SystemStatus[];
  collectSeries: DayBucket[]; // 수집량 14일 일별
  blogSeries: DayBucket[]; // 블로그 발행 14일 일별
  generatedAtIso: string;
};

// 한 시스템의 상태 — 최신 발화 1건 + 24h 카운트(가벼운 쿼리 2개).
async function fetchSystemStatus(admin: Admin, sys: SystemDef, sinceIso24: string): Promise<SystemStatus> {
  const [{ data: latest }, { count }] = await Promise.all([
    admin
      .from("admin_actions")
      .select("created_at")
      .in("action", sys.actions)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .in("action", sys.actions)
      .gte("created_at", sinceIso24),
  ]);

  const lastFiredIso = latest?.created_at ?? null;
  let hoursAgo: number | null = null;
  let state: "green" | "yellow" | "red" = "red";
  if (lastFiredIso) {
    hoursAgo = (Date.now() - new Date(lastFiredIso).getTime()) / 3600_000;
    if (hoursAgo <= sys.expectHours) state = "green";
    else if (hoursAgo <= sys.expectHours * 2) state = "yellow";
    else state = "red";
  }
  return {
    key: sys.key,
    label: sys.label,
    lastFiredIso,
    hoursAgo: hoursAgo === null ? null : Math.round(hoursAgo * 10) / 10,
    count24h: count ?? 0,
    state,
  };
}

// KST 기준 일자 문자열(YYYY-MM-DD). 한국 운영이라 KST 일 경계로 버킷.
function kstDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

// 최근 N일 일별 빈 버킷 배열(오래된→최신) 생성.
function emptyDays(n: number): DayBucket[] {
  const out: DayBucket[] = [];
  const nowKst = new Date(Date.now() + 9 * 3600_000);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(nowKst.getTime() - i * 86400_000);
    out.push({ day: d.toISOString().slice(0, 10), count: 0 });
  }
  return out;
}

// created_at 목록을 일별 버킷으로 — 테이블에서 created_at 만 fetch(페이지네이션) 후 JS 집계.
async function fetchDailySeries(
  admin: Admin,
  table: "news_posts" | "blog_posts",
  sinceIso: string,
  days: number,
): Promise<DayBucket[]> {
  const buckets = emptyDays(days);
  const idx = new Map(buckets.map((b, i) => [b.day, i]));
  for (let pg = 0; pg < 12; pg++) {
    const { data, error } = await admin
      .from(table)
      .select("created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .range(pg * 1000, pg * 1000 + 999);
    if (error || !data || data.length === 0) break;
    for (const row of data as { created_at: string }[]) {
      const day = kstDay(row.created_at);
      const i = idx.get(day);
      if (i !== undefined) buckets[i].count++;
    }
    if (data.length < 1000) break;
  }
  return buckets;
}

export async function getOverviewMetrics(): Promise<OverviewMetrics> {
  const admin = createAdminClient();
  const since24 = new Date(Date.now() - 24 * 3600_000).toISOString();
  const since14d = new Date(Date.now() - 14 * 86400_000).toISOString();

  const [systems, collectSeries, blogSeries] = await Promise.all([
    Promise.all(AUTONOMOUS_SYSTEMS.map((s) => fetchSystemStatus(admin, s, since24))),
    fetchDailySeries(admin, "news_posts", since14d, 14),
    fetchDailySeries(admin, "blog_posts", since14d, 14),
  ]);

  return {
    systems,
    collectSeries,
    blogSeries,
    generatedAtIso: new Date().toISOString(),
  };
}
