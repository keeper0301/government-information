// ============================================================
// 매일 아침 KPI 다이제스트 — 사장님 휴대폰 SMS 자동 발송
// ============================================================
// 매일 KST 08:00 cron 으로 어제 핵심 지표를 한 줄로 요약.
// 사장님이 어드민 들여다보지 않아도 "어제 운영 어떻게 굴러갔는지" 즉시 인지.
//
// 어드민 자동화 마스터 #2 (2026-05-07): KPI 6 → 10 확장 + 검토 큐 통합.
// 사장님 검토 필요 항목 (dedupe·naver-blog) ≥ 1 일 때만 어드민 link 노출.
//
// SMS 90자 초과 시 Solapi 자동 LMS 전환 (~30원/일). 검토 큐 0 일 때는 link 빠져
// SMS 짧아짐.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { getPressAutoConfirmStats } from "@/lib/press-ingest/filter";

export type DigestData = {
  // 기존 6 KPI
  signups24h: number;
  newPolicies24h: number; // welfare + loan + naver-news 합계
  active7d: number;
  pressAutoConfirmed24h: number; // press_l2_confirm by actor=null
  newsAutoHidden24h: number;     // news_auto_hide by actor=null
  dedupeAutoConfirmed24h: number; // dedupe_auto_confirm by actor=null
  // 어드민 자동화 #2 추가 4 KPI
  wordpressPublished24h: number; // wordpress_publish_log status='published' 24h
  cronFailures24h: number;       // cron_failure_log notified_at 24h
  dedupePending: number;         // welfare+loan 자동 confirm 안 된 dedupe 검토 큐
  naverBlogPending: number;      // naver_blog_queue status='pending'
  // 광역 보도자료 4 layer fallback chain 운영 가시성 (2026-05-08)
  // 광역 매핑 의존도 — pressAutoConfirmed 0 이면 0%. 80% 이상 시 LLM 추출률 ↓ 신호.
  pressProvincePct: number;
};

/**
 * 어제 (24h 윈도우) KPI 데이터 수집.
 * 단일 page-rendering 비용 ~수 query — Promise.all 로 병렬.
 * 신규 query 가 실패해도 (테이블 부재 등) 안전 0 fallback.
 */
export async function collectDailyDigest(): Promise<DigestData> {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // 각 query 를 safe 0 fallback 으로 감쌈 — 1개 실패해도 SMS 발송 보장.
  // Major fix (2026-05-07 review): Promise.all 은 1 reject 면 전체 죽음 → 일일
  // SMS 통째 미발송 위험. 각 query 에 try/catch 부착 + count null fallback.
  // PromiseLike — Supabase builder 가 thenable 이라 직접 await 가능.
  async function safe<T extends { count: number | null }>(
    builder: PromiseLike<T>,
  ): Promise<number> {
    try {
      const result = await builder;
      return result.count ?? 0;
    } catch (e) {
      console.warn(
        `[daily-digest] query 실패 (0 fallback):`,
        e instanceof Error ? e.message : String(e),
      );
      return 0;
    }
  }

  const [
    signups24h,
    welfareNew,
    loanNew,
    newsNew,
    active7d,
    pressAutoConfirmed24h,
    newsAutoHidden24h,
    dedupeAutoConfirmed24h,
    wordpressPublished24h,
    cronFailures24h,
    welfareDedupe,
    loanDedupe,
    naverBlogPending,
  ] = await Promise.all([
    safe(
      admin
        .from("user_profiles")
        .select("user_id", { count: "exact", head: true })
        .gte("created_at", since24h),
    ),
    safe(
      admin
        .from("welfare_programs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since24h),
    ),
    safe(
      admin
        .from("loan_programs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since24h),
    ),
    safe(
      admin
        .from("news_posts")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since24h),
    ),
    safe(
      admin
        .from("user_profiles")
        .select("user_id", { count: "exact", head: true })
        .gte("updated_at", since7d),
    ),
    safe(
      admin
        .from("admin_actions")
        .select("id", { count: "exact", head: true })
        .eq("action", "press_l2_confirm")
        .is("actor_id", null)
        .gte("created_at", since24h),
    ),
    safe(
      admin
        .from("admin_actions")
        .select("id", { count: "exact", head: true })
        .eq("action", "news_auto_hide")
        // Major fix (review): 다른 자동 처리 query 와 일치하게 actor_id IS NULL.
        // 사장님 수동 hide 는 자동 카운트에서 제외.
        .is("actor_id", null)
        .gte("created_at", since24h),
    ),
    safe(
      admin
        .from("admin_actions")
        .select("id", { count: "exact", head: true })
        .eq("action", "dedupe_auto_confirm")
        .is("actor_id", null)
        .gte("created_at", since24h),
    ),
    safe(
      admin
        .from("wordpress_publish_log")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .gte("published_at", since24h),
    ),
    // Major fix (review): cron_failure_log.notified_at 은 dedupe cooldown 으로
    // 동일 에러 반복 시 갱신 안 됨 → 실제 실패 카운트 미반영. last_seen_at 가
    // 매 발생마다 갱신되어 정확.
    safe(
      admin
        .from("cron_failure_log")
        .select("id", { count: "exact", head: true })
        .gte("last_seen_at", since24h),
    ),
    safe(
      admin
        .from("welfare_programs")
        .select("id", { count: "exact", head: true })
        .not("duplicate_of_id", "is", null)
        .is("dedupe_auto_confirmed_at", null),
    ),
    safe(
      admin
        .from("loan_programs")
        .select("id", { count: "exact", head: true })
        .not("duplicate_of_id", "is", null)
        .is("dedupe_auto_confirmed_at", null),
    ),
    safe(
      admin
        .from("naver_blog_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ),
  ]);

  const newPolicies24h = welfareNew + loanNew + newsNew;
  const dedupePending = welfareDedupe + loanDedupe;

  // 광역 매핑 의존도 — 별도 fetch (3 query). 실패 시 0% fallback (SMS 정상 발송).
  const pressStats = await getPressAutoConfirmStats().catch((e) => {
    console.warn(
      "[daily-digest] press auto-confirm stats fetch 실패 (0 fallback):",
      e instanceof Error ? e.message : String(e),
    );
    return { auto_confirmed_24h: 0, auto_confirmed_7d: 0, province_dependency_pct: 0 };
  });

  return {
    signups24h,
    newPolicies24h,
    active7d,
    pressAutoConfirmed24h,
    newsAutoHidden24h,
    dedupeAutoConfirmed24h,
    wordpressPublished24h,
    cronFailures24h,
    dedupePending,
    naverBlogPending,
    pressProvincePct: pressStats.province_dependency_pct,
  };
}

/**
 * 사장님 검토 필요 큐 합계. ≥ 1 면 SMS 에 어드민 link 추가, 아니면 link 생략.
 */
export function reviewQueueTotal(data: DigestData): number {
  return data.dedupePending + data.naverBlogPending;
}

/**
 * 사장님 SMS 본문 — 핵심 지표 + 검토 필요 큐 (≥1 일 때만 노출).
 * 90자 초과 시 Solapi 가 자동 LMS 전환 (~30원/일).
 */
export function formatDigestMessage(data: DigestData): string {
  const date = new Date();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  // 광역 매핑 의존도 라벨 — 자동 confirm 0 이면 표시 안 함 (의미 X), 1+ 면 짧게.
  // 80%+ 면 ⚠ 마크 (LLM prompt 재검토 신호).
  const provinceMark =
    data.pressAutoConfirmed24h === 0
      ? ""
      : data.pressProvincePct >= 80
        ? `(광역${data.pressProvincePct}%⚠)`
        : `(광역${data.pressProvincePct}%)`;

  const lines: string[] = [
    `[keepioo ${mm}/${dd}]`,
    `가입 ${data.signups24h} · 활성 ${data.active7d}`,
    `신규 정책 ${data.newPolicies24h} · 워드 ${data.wordpressPublished24h}`,
    `자동: 보도 ${data.pressAutoConfirmed24h}${provinceMark} · 뉴스hide ${data.newsAutoHidden24h} · dedupe ${data.dedupeAutoConfirmed24h}`,
  ];

  // 검토 필요 큐 — 1건 이상일 때만 노출 (사장님 진입 동기 명확)
  const reviewTotal = reviewQueueTotal(data);
  if (reviewTotal > 0) {
    lines.push(
      `검토 필요: dedupe ${data.dedupePending} · 네이버 ${data.naverBlogPending}`,
    );
  }

  // cron 실패 — 1건 이상일 때만 노출 (정상 운영 시 SMS 깔끔)
  if (data.cronFailures24h > 0) {
    lines.push(`⚠️ cron 실패 ${data.cronFailures24h}건`);
  }

  return lines.join("\n");
}
