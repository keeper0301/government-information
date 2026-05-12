// lib/health-check.ts
// Phase 6 — 운영 모니터링 헬스 신호 + 임계치 점검 helper.
// 사용처:
//   - app/api/cron/health-alert/route.ts (매일 09:00 KST 임계치 점검 → 이메일)
//   - app/admin/health/page.tsx (실시간 헬스 신호 4 카드 표시)

import { createAdminClient } from "@/lib/supabase/admin";
// W1 fix (Phase 6 후속) — listUsers 중복 호출 회피.
// 같은 요청 안에서 lib/admin-health 등이 getAuthUsersCached 를 이미 호출했다면
// react cache 가 결과 공유 → round trip 1회.
import { getAuthUsersCached } from "@/lib/admin-stats";

export type HealthSignals = {
  // 24h 신규 가입 수
  signups24h: number;
  // 7d 활성 사용자 수 (last_sign_in_at >= 7d ago) — funnel-health 분석 카드와 호환
  active7d: number;
  // 7d 활성 (확장) — last_sign_in_at OR created_at 7d 내 unique 사용자.
  // keepioo 같은 검색·읽기 위주 서비스에서는 가입 후 메일 확인만 하고 다시 로그인
  // 안 하는 사용자가 많아, signin 만으로 활성을 정의하면 false positive 발생 가능.
  // 임계치 점검 (low_activity alert) 은 이 값 기준으로 판정해 false positive 줄임.
  active7dAny: number;
  // 24h 결제 실패·해지 (subscriptions.cancelled_at 24h)
  failed24h: number;
  // 24h cron 실패 알림 건수 (cron_failure_log notified_at)
  cronFailures24h: number;
  // 24h 알림 발송 실패 (alert_deliveries status = 'failed')
  deliveryFailures24h: number;
  // ─── Phase 1 자동 진단 (2026-05-08 추가) ───
  // 자동화 적체·노쇼 신호 — 사고 자동 진단 cron 이 매일 점검
  newsBacklogTotal: number;        // news_posts classified_at NULL + visible — cron cap timeout 신호
  pressPending: number;            // press_ingest_candidates status='pending' — 사장님 검토 큐
  pressLastClassifyHours: number;  // 마지막 press_l2_classify 흔적 시간차 — cron 노쇼 신호 (Vercel cron path bug 등)
  enrichPermanentSkip: number;     // enrich detail_permanently_skipped_at 누적 — 외부 API 일관 실패 신호
  /**
   * press_ingest_candidates 의 confidence_tier='low' + status='pending' 큐 적체.
   * 적극 모드 (high+mid 자동) 채택 후 평소엔 거의 0. 10+ = LLM 신뢰도 하락 신호.
   * PRESS_LOW_TIER_FLOOR env 로 1줄 toggle.
   */
  pressLowTierBacklog: number;
  /**
   * Instagram OAuth token 가장 임박한 만료까지 일수.
   * null = instagram_oauth_tokens 테이블 빈 상태 (OAuth 미연결 — 알림 X).
   * 0 ≤ N ≤ 7 일 때 alert (60일 long-lived token refresh 가 못 일어남).
   */
  instagramTokenExpiresInDays: number | null;
  /**
   * 네이버 RPA 세션 cookies 가장 빠른 만료까지 일수.
   * null = naver_session_cookies 테이블 비었거나 expires_min 없음 (미연결 — 알림 X).
   * 0 ≤ N ≤ 7 일 때 alert (수동 cookies 재발급 못 일어나면 cron 막힘).
   */
  naverCookiesExpiresInDays: number | null;
};

export type ThresholdAlert = {
  key:
    | "low_activity"
    | "payment_fail"
    | "cron_fail"
    | "news_backlog"
    | "press_pending"
    | "press_no_show"
    | "press_low_tier"
    | "enrich_stuck"
    | "instagram_token_expiring"
    | "naver_cookies_expiring";
  message: string;
  // 사장님이 즉시 취할 액션 1줄 (Phase 1 — 사고 자동 진단 권장 hot-fix).
  // 정상 신호 발견 시 SMS 에 함께 노출 → 사장님 진입 동기 ↓.
  recommendation?: string;
};

const CRON_FAIL_ALERT_THRESHOLD = Number(
  process.env.CRON_FAIL_ALERT_THRESHOLD ?? "3",
);
// 운영 초기 (사장님 본인만 로그인) 단계에서 매일 발화하면 noise →
// LOW_ACTIVITY_FLOOR env 로 1분 rollback 가능. 0 으로 두면 alert 자체 끄기 효과.
const ACTIVE_7D_FLOOR = Number(process.env.LOW_ACTIVITY_FLOOR ?? "5");
// Phase 1 자동 진단 임계치 — env 로 1분 toggle 가능 (위험 0).
// 정상 운영 baseline 보다 약간 여유 — false positive 톤 다운.
const NEWS_BACKLOG_FLOOR = Number(
  process.env.NEWS_BACKLOG_ALERT_FLOOR ?? "1000",
);
const PRESS_PENDING_FLOOR = Number(
  process.env.PRESS_PENDING_ALERT_FLOOR ?? "10",
);
const PRESS_NO_SHOW_HOURS = Number(
  process.env.PRESS_NO_SHOW_ALERT_HOURS ?? "36",
);
const ENRICH_PERMANENT_SKIP_FLOOR = Number(
  process.env.ENRICH_PERMANENT_SKIP_FLOOR ?? "100",
);
// Task 8 (2026-05-08) — low tier 큐 적체 임계.
// 적극 모드 (high+mid 자동) 채택 후 평소엔 거의 0 이어야 함.
// 10+ 누적 = LLM 신뢰도 하락 신호 → 사장님 검토 또는 일시 적극화 검토.
const PRESS_LOW_TIER_FLOOR = Number(process.env.PRESS_LOW_TIER_FLOOR ?? "10");

export async function getHealthSignals(): Promise<HealthSignals> {
  const sb = createAdminClient();
  const since24Iso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7dIso = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // auth.users 24h 신규·7d 활성 — getAuthUsersCached 로 round trip 공유.
  // /admin/health 페이지가 lib/admin-health 와 함께 호출해도 listUsers 1회만.
  const allUsers = await getAuthUsersCached();
  const signups24h = allUsers.filter(
    (u) => u.created_at && u.created_at >= since24Iso,
  ).length;
  // 좁은 활성 정의 — 분석 카드와 호환 유지 (funnel-health 와 동일 의미)
  const active7d = allUsers.filter(
    (u) => u.last_sign_in_at && u.last_sign_in_at >= since7dIso,
  ).length;
  // 확장 활성 — signin OR 7d 내 가입. 임계치 점검 false positive 방지용.
  // 가입 직후 메일 확인만 하고 재로그인 안 하는 사용자도 활성으로 인정해 alert 톤 다운.
  const active7dAny = allUsers.filter(
    (u) =>
      (u.last_sign_in_at && u.last_sign_in_at >= since7dIso) ||
      (u.created_at && u.created_at >= since7dIso),
  ).length;

  // 결제 실패 — subscriptions cancelled_at 24h
  const { count: cancelled } = await sb
    .from("subscriptions")
    .select("*", { count: "exact", head: true })
    .gte("cancelled_at", since24Iso);
  const failed24h = cancelled ?? 0;

  // cron 실패 알림 24h (notified_at — 신규 알림 발송된 것)
  const { count: cronCount } = await sb
    .from("cron_failure_log")
    .select("*", { count: "exact", head: true })
    .gte("notified_at", since24Iso);
  const cronFailures24h = cronCount ?? 0;

  // alert_deliveries 실패 24h
  const { count: delCount } = await sb
    .from("alert_deliveries")
    .select("*", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("created_at", since24Iso);
  const deliveryFailures24h = delCount ?? 0;

  // ─── Phase 1 자동 진단 (2026-05-08) ───────────────────────
  // news 미분류 backlog — cron cap timeout 또는 cron 노쇼 신호
  const { count: newsBacklogCount } = await sb
    .from("news_posts")
    .select("*", { count: "exact", head: true })
    .is("classified_at", null)
    .eq("is_hidden", false);
  const newsBacklogTotal = newsBacklogCount ?? 0;

  // press_ingest_candidates 검토 큐 — 4 layer fallback 후 정상 0~5
  const { count: pressPendingCount } = await sb
    .from("press_ingest_candidates")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  const pressPending = pressPendingCount ?? 0;

  // Task 8 — low tier (LLM 저신뢰도) 큐 적체.
  // DDL 077 적용 전이면 confidence_tier 컬럼 자체가 없으니 0 반환 (정상 동작).
  const { count: lowTierCount } = await sb
    .from("press_ingest_candidates")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending")
    .eq("confidence_tier", "low");
  const pressLowTierBacklog = lowTierCount ?? 0;

  // 마지막 press_l2_classify 흔적 시간차 — cron 노쇼 진단
  const { data: lastPress } = await sb
    .from("admin_actions")
    .select("created_at")
    .eq("action", "press_l2_classify")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const pressLastClassifyHours = lastPress?.created_at
    ? Math.round(
        (Date.now() - new Date(lastPress.created_at).getTime()) / 3600000,
      )
    : 999; // 흔적 자체가 없으면 큰 값 (반드시 alert)

  // enrich 영구 skip 누적 — 외부 API 일관 실패 신호 (welfare + loan 합산)
  const [welfSkip, loanSkip] = await Promise.all([
    sb
      .from("welfare_programs")
      .select("*", { count: "exact", head: true })
      .not("detail_permanently_skipped_at", "is", null),
    sb
      .from("loan_programs")
      .select("*", { count: "exact", head: true })
      .not("detail_permanently_skipped_at", "is", null),
  ]);
  const enrichPermanentSkip = (welfSkip.count ?? 0) + (loanSkip.count ?? 0);

  // Instagram OAuth token 만료 임박 — 가장 임박한 1건 (multi-account 대비)
  // 테이블 빈 상태면 row 없음 → null (OAuth 미연결 — 알림 X)
  const { data: ig } = await sb
    .from("instagram_oauth_tokens")
    .select("expires_at")
    .order("expires_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ expires_at: string }>();
  const instagramTokenExpiresInDays = ig?.expires_at
    ? Math.floor(
        (new Date(ig.expires_at).getTime() - Date.now()) / 86_400_000,
      )
    : null;

  // 네이버 RPA cookies 만료 임박 — active row 의 expires_min 기준
  // 테이블 빈 상태면 row 없음 → null (cookies 미업로드 — 알림 X)
  const { data: nv } = await sb
    .from("naver_session_cookies")
    .select("expires_min")
    .eq("active", true)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ expires_min: string | null }>();
  const naverCookiesExpiresInDays = nv?.expires_min
    ? Math.floor((new Date(nv.expires_min).getTime() - Date.now()) / 86_400_000)
    : null;

  return {
    signups24h,
    active7d,
    active7dAny,
    failed24h,
    cronFailures24h,
    deliveryFailures24h,
    newsBacklogTotal,
    pressPending,
    pressLastClassifyHours,
    enrichPermanentSkip,
    pressLowTierBacklog,
    instagramTokenExpiresInDays,
    naverCookiesExpiresInDays,
  };
}

// 임계치 점검 — health-alert cron 이 호출, 위반 항목만 반환
export function checkThresholds(s: HealthSignals): ThresholdAlert[] {
  const alerts: ThresholdAlert[] = [];

  // 가입 활성도 — active7dAny (signin OR 7d 내 가입) 기준으로 false positive 방지.
  // 둘 다 충족 (24h 가입 0 AND 7d 신규 가입·로그인 모두 floor 미만) 일 때만 alert →
  // 사장님 본인 1명만 로그인하는 운영 초기 패턴은 정상 신호로 처리됨.
  if (s.signups24h === 0 && s.active7dAny < ACTIVE_7D_FLOOR) {
    alerts.push({
      key: "low_activity",
      message: `24h 신규 가입 0 + 7d 활성(가입+로그인) ${s.active7dAny}명 (< ${ACTIVE_7D_FLOOR}). 가입 funnel 점검 필요.`,
      recommendation:
        "/admin/insights funnel 카드 + sitemap 등록 상태 + AdSense/SEO 트래픽 점검 (Phase 5 marketing cron 가동 확인)",
    });
  }

  // 결제 실패
  if (s.failed24h >= 1) {
    alerts.push({
      key: "payment_fail",
      message: `24h 사용자 해지 ${s.failed24h}건. /admin/insights 확인.`,
      recommendation:
        "/admin/insights subscriptions 카드 + 토스 콘솔 거래 내역 (해지 사유 카테고리화 → 다음 phase 개선 우선순위)",
    });
  }

  // cron 실패 (환경변수 임계치)
  if (s.cronFailures24h >= CRON_FAIL_ALERT_THRESHOLD) {
    alerts.push({
      key: "cron_fail",
      message: `24h cron 실패 알림 ${s.cronFailures24h}건 (임계치 ${CRON_FAIL_ALERT_THRESHOLD}).`,
      recommendation: "/admin/cron-failures 에서 cron 별 실패 패턴 확인 + 일괄 재시도",
    });
  }

  // Phase 1 자동 진단 — news 미분류 backlog (cron timeout / cap 부족 신호)
  if (s.newsBacklogTotal >= NEWS_BACKLOG_FLOOR) {
    alerts.push({
      key: "news_backlog",
      message: `news 미분류 backlog ${s.newsBacklogTotal.toLocaleString()}건 (임계 ${NEWS_BACKLOG_FLOOR}+).`,
      recommendation:
        "/admin/cron-trigger 에서 news-classify 수동 실행 또는 news_classify_run audit 의 duration_ms 확인 (timeout 추정 시 maxDuration 상향)",
    });
  }

  // 광역 보도자료 검토 큐 적체 — 4 layer fallback 후에도 사장님 검토 대기
  if (s.pressPending >= PRESS_PENDING_FLOOR) {
    alerts.push({
      key: "press_pending",
      message: `press_ingest_candidates pending ${s.pressPending}건 (임계 ${PRESS_PENDING_FLOOR}+).`,
      recommendation:
        "/admin/press-ingest 검토 또는 LLM apply_url 추출 정확도 점검 (자동 confirm 률 하락 신호)",
    });
  }

  // press_l2_classify 흔적 노쇼 — Vercel cron path bug 또는 OPENAI_API_KEY 만료
  if (s.pressLastClassifyHours >= PRESS_NO_SHOW_HOURS) {
    alerts.push({
      key: "press_no_show",
      message: `press_l2_classify 마지막 ${s.pressLastClassifyHours}h 전 (임계 ${PRESS_NO_SHOW_HOURS}h+).`,
      recommendation:
        "/admin/cron-trigger 에서 press-ingest 수동 실행 + OPENAI_API_KEY · vercel.json schedule 확인",
    });
  }

  // Task 8 — LLM 신뢰도 'low' 큐 적체 (적극 모드 후에도 사장님 검토 필요한 잔여 큐)
  if (s.pressLowTierBacklog >= PRESS_LOW_TIER_FLOOR) {
    alerts.push({
      key: "press_low_tier",
      message: `LLM 신뢰도 'low' 큐 ${s.pressLowTierBacklog}건 (임계 ${PRESS_LOW_TIER_FLOOR}+).`,
      recommendation:
        "/admin/press-ingest 검토 또는 AUTO_CONFIRM_TIER_FLOOR=low 로 일시 적극화 (위험 감수)",
    });
  }

  // enrich detail-fetcher 영구 skip 폭증 — 외부 API 일관 실패
  if (s.enrichPermanentSkip >= ENRICH_PERMANENT_SKIP_FLOOR) {
    alerts.push({
      key: "enrich_stuck",
      message: `enrich 영구 skip 누적 ${s.enrichPermanentSkip}건 (임계 ${ENRICH_PERMANENT_SKIP_FLOOR}+).`,
      recommendation:
        "/admin/enrich-detail 에서 일괄 해제 검토 (외부 API 회복 시) 또는 collector 점검",
    });
  }

  // Instagram OAuth token 만료 임박 — 7일 이내 (long-lived token refresh 못 일어남)
  // null = OAuth 미연결 (테이블 빈 상태) → alert 안 함 (사장님 의식적 결정)
  if (
    s.instagramTokenExpiresInDays !== null &&
    s.instagramTokenExpiresInDays <= 7
  ) {
    const isExpired = s.instagramTokenExpiresInDays < 0;
    alerts.push({
      key: "instagram_token_expiring",
      message: isExpired
        ? `Instagram OAuth token 이미 만료 (${Math.abs(s.instagramTokenExpiresInDays)}일 전). 자동 발행 중단됨.`
        : `Instagram OAuth token 만료 ${s.instagramTokenExpiresInDays}일 남음 (≤ 7일). 자동 refresh 임박.`,
      recommendation:
        "/admin/instagram 페이지에서 '재연결' 버튼 클릭 → 새 60일 token 발급. loadValidToken 의 inline refresh 가 자동 작동하지만 실패 시 사장님 수동 재연결 필요.",
    });
  }

  // 네이버 RPA cookies 만료 임박 — 7일 이내. 자동 refresh 불가 (사장님 manual cookies export 필요).
  // null = cookies 미업로드 (Phase 2-B 사장님 액션 안 됨) → alert 안 함.
  if (
    s.naverCookiesExpiresInDays !== null &&
    s.naverCookiesExpiresInDays <= 7
  ) {
    const isExpired = s.naverCookiesExpiresInDays < 0;
    alerts.push({
      key: "naver_cookies_expiring",
      message: isExpired
        ? `네이버 RPA cookies 이미 만료 (${Math.abs(s.naverCookiesExpiresInDays)}일 전). 자동 발행 중단됨.`
        : `네이버 RPA cookies 만료 ${s.naverCookiesExpiresInDays}일 남음 (≤ 7일). 사장님 cookies 재발급 필요.`,
      recommendation:
        "사장님 Chrome 으로 naver.com 재로그인 → F12 DevTools 에서 cookies 재 export → /admin/naver-blog/cookies 에 업로드.",
    });
  }

  return alerts;
}
