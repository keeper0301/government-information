// lib/admin-trends.ts
// Phase 6 — /admin/health 의 30일 추세 차트 데이터 쿼리.
// 모든 결과는 30일 fill-zero 처리 (값 없는 날도 0 표시 → 차트 빈 칸 X).

import { createAdminClient } from "@/lib/supabase/admin";

export type DailyPoint = {
  date: string; // YYYY-MM-DD (KST 기준)
  value: number;
};

export type AdminTrends = {
  dau: DailyPoint[];
  subscriptionsNew: DailyPoint[];
  subscriptionsCancelled: DailyPoint[];
  blogPublished: DailyPoint[];
  newsCollected: DailyPoint[];
};

const DAYS = 30;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 30일 KST 일자 array (30일 전 → 오늘, 오름차순)
function buildDateAxis(): string[] {
  const arr: string[] = [];
  const now = Date.now();
  for (let i = DAYS - 1; i >= 0; i--) {
    const kst = new Date(now - i * 24 * 60 * 60 * 1000 + KST_OFFSET_MS);
    arr.push(kst.toISOString().slice(0, 10));
  }
  return arr;
}

// 일자별 row count 를 DailyPoint[] 로 변환 (fill-zero)
function fillZero(rows: { date: string; cnt: number }[]): DailyPoint[] {
  const axis = buildDateAxis();
  const map = new Map(rows.map((r) => [r.date, r.cnt]));
  return axis.map((date) => ({ date, value: map.get(date) ?? 0 }));
}

// timestamp string → KST 일자 (YYYY-MM-DD)
function toKstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

function bucketByDate<T extends Record<string, unknown>>(
  rows: T[] | null,
  field: keyof T,
): { date: string; cnt: number }[] {
  if (!rows) return [];
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = r[field];
    if (typeof v !== "string") continue;
    const date = toKstDate(v);
    m.set(date, (m.get(date) ?? 0) + 1);
  }
  return Array.from(m.entries()).map(([date, cnt]) => ({ date, cnt }));
}

export async function getAdminTrends(): Promise<AdminTrends> {
  const sb = createAdminClient();
  const since30Iso = new Date(
    Date.now() - DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // DAU — auth.users.last_sign_in_at 일별 distinct
  const { data: usersResp } = await sb.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const dauMap = new Map<string, Set<string>>();
  for (const u of usersResp?.users ?? []) {
    if (!u.last_sign_in_at || u.last_sign_in_at < since30Iso) continue;
    const date = toKstDate(u.last_sign_in_at);
    const set = dauMap.get(date) ?? new Set();
    set.add(u.id);
    dauMap.set(date, set);
  }
  const dau = fillZero(
    Array.from(dauMap.entries()).map(([date, set]) => ({
      date,
      cnt: set.size,
    })),
  );

  // 병렬 쿼리 — subscriptions·blog·news
  const [subsNew, subsCancelled, blog, news] = await Promise.all([
    sb
      .from("subscriptions")
      .select("created_at")
      .gte("created_at", since30Iso),
    sb
      .from("subscriptions")
      .select("cancelled_at")
      .gte("cancelled_at", since30Iso)
      .not("cancelled_at", "is", null),
    sb
      .from("blog_posts")
      .select("published_at")
      .gte("published_at", since30Iso)
      .not("published_at", "is", null),
    sb
      .from("news_posts")
      .select("created_at")
      .gte("created_at", since30Iso),
  ]);

  return {
    dau,
    subscriptionsNew: fillZero(bucketByDate(subsNew.data, "created_at")),
    subscriptionsCancelled: fillZero(
      bucketByDate(subsCancelled.data, "cancelled_at"),
    ),
    blogPublished: fillZero(bucketByDate(blog.data, "published_at")),
    newsCollected: fillZero(bucketByDate(news.data, "created_at")),
  };
}
