// ============================================================
// 24h source_code prefix 별 row count — silent fail 감지 (2026-05-22)
// ============================================================
// 2026-05-22 audit 사고 (NOT NULL 누락) 재발생 자동 감지용.
// /api/cron/silent-fail-detect 가 같은 데이터로 텔레그램 alert,
// 이 카드는 사장님 PC autonomous hub 시각화.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type SilentFailPrefix = {
  prefix: string;
  label: string; // 한국어 라벨
  count24h: number;
  ok: boolean;
};

export type SilentFailStats = {
  prefixes: SilentFailPrefix[];
  failedCount: number; // count24h === 0 인 prefix 개수
  observedAt: string; // ISO
};

const WATCH_PREFIXES: Array<{ prefix: string; label: string }> = [
  { prefix: "local-press-", label: "시·군 보도자료 (27개)" },
  { prefix: "naver-news-", label: "네이버 뉴스 (17개 광역)" },
  { prefix: "korea-kr-", label: "korea.kr 부처 RSS" },
];

export async function getSilentFailStats(): Promise<SilentFailStats> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const prefixes: SilentFailPrefix[] = [];
  let failedCount = 0;

  for (const { prefix, label } of WATCH_PREFIXES) {
    const { count, error } = await admin
      .from("news_posts")
      .select("id", { count: "exact", head: true })
      .like("source_code", `${prefix}%`)
      .gte("created_at", since);
    const n = error ? 0 : (count ?? 0);
    const ok = !error && n > 0;
    prefixes.push({ prefix, label, count24h: n, ok });
    if (!ok) failedCount += 1;
  }

  return {
    prefixes,
    failedCount,
    observedAt: new Date().toISOString(),
  };
}
