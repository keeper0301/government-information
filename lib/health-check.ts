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
import {
  getStaleCityNames,
  getHighNullDateCityCount,
  getNewsRatio,
} from "@/lib/analytics/local-press-stats";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense-review-mode";
import { getBlogPublishStats } from "@/lib/analytics/blog-publish-stats";
import {
  getCollectorDiagnoses,
  formatCollectorProblems,
  isProblemStatus,
  getSustainedInsertStops,
  formatInsertStops,
  getCadenceRegressions,
  formatCadenceRegressions,
} from "@/lib/monitoring/collector-health-diagnosis";
import { getRateLimitStatus, type RateLimitHotBucket } from "@/lib/monitoring/rate-limit-status";
import { getPressAutoConfirmStats } from "@/lib/press-ingest/filter";

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
  // 7d 익명/로그인 이벤트 수. 검색·읽기 위주 서비스는 가입 전 program_view/apply_click 이
  // 주요 activity 이므로 auth.users 만 보면 false positive 가 난다.
  userEvents7d: number;
  // 24h 결제 실패·해지 (subscriptions.cancelled_at 24h)
  failed24h: number;
  // 24h cron 실패 알림 건수 (cron_failure_log notified_at)
  cronFailures24h: number;
  // 24h 알림 발송 실패 (alert_deliveries status = 'failed')
  deliveryFailures24h: number;
  // 최근 fixed-window rate limit top bucket 중 최대 count. 원시 IP/user id 는 마스킹된 top list 만 노출.
  rateLimitMaxCount: number;
  rateLimitHotBuckets: RateLimitHotBucket[];
  // ─── Phase 1 자동 진단 (2026-05-08 추가) ───
  // 자동화 적체·노쇼 신호 — 사고 자동 진단 cron 이 매일 점검
  newsBacklogTotal: number;        // news_posts classified_at NULL + visible — cron cap timeout 신호
  pressPending: number;            // press_ingest_candidates status='pending' — 사장님 검토 큐
  pressLastClassifyHours: number;  // 마지막 press_l2_classify 흔적 시간차 — cron 노쇼 신호 (Vercel cron path bug 등)
  enrichPermanentSkip: number;     // enrich detail_permanently_skipped_at 누적 — 외부 API 일관 실패 신호
  /**
   * press_ingest_candidates 의 confidence_tier='low' + status='pending' 큐 적체.
   * 30+ = P3 monitor, 70+ 또는 14d+ stale = P2 후보. 30 미만은 weekly reminder/수동 검수.
   * PRESS_LOW_TIER_FLOOR env 로 1줄 toggle.
   */
  pressLowTierBacklog: number;
  /**
   * low tier pending 중 기존 cleanup 정책(14일+ 묵음)에 해당하는 수.
   * 0이면 현재 low queue 는 자동 reject 대상이 아니라 수동 검수/관찰 대상이다.
   */
  pressLowTierCleanupEligible: number;
  /** 7일 내 low tier 검수 결과 기반 confirm rate. 표본 부족 시 0이며 hint 를 함께 본다. */
  pressLowConfirmRate7d: number;
  /** 7일 내 low tier 검수 결정 수(confirmed+rejected). */
  pressLowDecisions7d: number;
  /** low tier 자동화 floor 판단 힌트. AUTO_CONFIRM_TIER_FLOOR=low 완화 금지/검토 근거. */
  pressLowConfirmRateHint: string;
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
  /**
   * 24h 안 신규 정책 inflow (welfare_programs + loan_programs 합산).
   * source_code IS NOT NULL — collector + press-ingest 양쪽 path 모두 카운트, manual 만 제외.
   * 0건 = 수집 cron 사고 (collector / press-ingest / GitHub Actions 노쇼).
   * 사이트 핵심 가치 = "오늘 새 정책" 이라 이게 0 이면 사장님 즉시 알아야 함.
   */
  policyInflow24h: number;
  /**
   * 24h 안 welfare_programs 신규 inflow (source_code IS NOT NULL).
   * 합산이 통과해도 welfare 단독 노쇼 진단 가능 — message 정보 강화용.
   */
  welfareInflow24h: number;
  /**
   * 24h 안 loan_programs 신규 inflow (source_code IS NOT NULL — collector + press 합산).
   * 데이터 기반 fix (2026-05-14 후속): 직전 commit 의 auto_confirm_tier 가드는 collector path
   * (mss·kinfa·fsc 등 99건) 를 모두 무시하던 결함 → loan_inflow_zero false positive 보장.
   * 새 source_code 가드는 collector + press-ingest 모두 카운트, manual 만 제외.
   */
  loanInflow24h: number;
  /**
   * loan_programs 마지막 created_at 시간차 (hours, source_code IS NOT NULL).
   * 48h+ = loan 수집 cron 사고 (collector + press-ingest 양쪽 path 모두 노쇼).
   * 흔적 없으면 999 (반드시 alert).
   */
  loanLastInflowHours: number;
  /**
   * naver_publish_audit 24h 시도 통계 (codex 권장 spec).
   * fail_rate ≥ 90% AND attempts ≥ FLOOR AND eligible_pending > 0 시 발화.
   *
   * - attempts = result IN ('success', 'fail') 만 카운트 — 실 시도. 'skipped' (시간대·daily_cap·
   *   no_cookies·disabled·dry_run·outside_hours 등) 는 시도 자체 안 한 것이라 제외.
   *   사장님 PC 미가동 = attempts 0 (false positive 차단).
   * - fails = result='fail' 만 카운트.
   * - eligible_pending = 발행 가능한 큐 (status='pending' AND attempt_count < 3) — 0 이면
   *   큐 자체가 비어 발송 시도 안 한 것 (정상). pending 있는데 거의 다 fail = 진짜 사고.
   *
   * 5/13 사고 baseline: attempts 1,734 + fail 1,734 + success 0 + pending 68 → 발화 보장.
   */
  naverPublishAttempts24h: number;
  naverPublishFails24h: number;
  naverPublishEligiblePending: number;
  /**
   * /api/collect (GitHub Actions collect.yml KST 13:00) 마지막 실행 시간차 (hours).
   * 36h+ = cron 노쇼 (GitHub Actions secret 만료·workflow disabled 등).
   * collect_run audit 흔적 없음 → 999 (반드시 alert).
   */
  collectLastRunHours: number;
  /**
   * 2026-05-17 추가 — 시·군 보도자료 collector 중 최근 72h 안 inserted 0 인 수.
   * 20 시·군 중 N 개 = collector regex 깨졌거나 사이트 구조 변경 (CMS 개편 등).
   * KST 09:00 cron 3회차 연속 실패 = 운영자 selector 점검 필요.
   * 첫 가동 3일 baseline 보다는 LOCAL_PRESS_STALE_FLOOR=10 정도 보수적 baseline 권장.
   */
  localPressStaleCities: number;
  /**
   * localPressStaleCities 의 상위 도시명. alert threshold 미만이어도 dry-run 에 노출해
   * "1건 남음" 상태를 바로 targeted rerun/selector 점검으로 이어갈 수 있게 한다.
   */
  localPressStaleDetail?: string;
  /**
   * 2026-06-09 추가 — 자가치유 감지 확장. 23 GHA collector 중 고장(no_audit·
   * list_broken·body_fail) 으로 분류된 수. ≥1 = 텔레그램 alert(도시·원인·제안 첨부).
   * stale(72h inserted0, floor 10)보다 민감 — collector 1개 깨져도 조기 감지.
   */
  localPressBrokenCollectors: number;
  /**
   * 2026-06-09 추가 — 위 고장 collector 의 도시·원인·수리제안 포맷 문자열(텔레그램용).
   * 정상이면 "". local_press_collector_broken alert 의 recommendation 으로 사용.
   */
  localPressCollectorDetail: string;
  /**
   * 2026-06-10 추가 — 회귀형 silent insert-stop collector 수. 목록은 꾸준히 가져오나
   * (fetched>0 ≥3일) 최근 신규 insert 0 + 이전엔 작동(회귀). 본문 추출 silent fail /
   * BODY_MIN_LEN 250 급감 감지. 동작구류 transient·저발행은 baseline 비교로 자동 제외.
   */
  localPressInsertStopped: number;
  /** 2026-06-10 추가 — 위 insert-stop collector 의 도시·회귀 detail(텔레그램용). 없으면 "". */
  localPressInsertStopDetail: string;
  /**
   * 2026-06-10 추가 — cron 완주 저하 collector 수. 실행빈도가 자기 baseline 대비 급락
   * (예: GHA 2회/일 → 0.8회/일 = timeout 으로 뒷순서 누락). GitHub API 없이 audit run 수만으로
   * cron 부분실패 감지. 2026-06-09 timeout(15→30) 같은 사고 영구 가드.
   */
  localPressCadenceDrops: number;
  /** 2026-06-10 추가 — 위 cadence 급락 collector 도시·빈도 detail(텔레그램용). 없으면 "". */
  localPressCadenceDetail: string;
  /**
   * 2026-05-30 추가 — 24h 안 null_date ≥5 누적된 시·군 수. factory date 추출
   * silent fallback (수집시각 = published_at) silent → audible. NewsArticle
   * schema 신뢰도 + 사용자 알림 "오늘 새 정책" 정확도 보호.
   */
  localPressNullDateCities: number;
  /**
   * 2026-05-30 추가 — keepioo 의 index 가능 페이지 중 news(외부 보도자료) 비중 (0~1).
   * ≥0.6 = Google "Scaled content abuse" 정책 의심 표면. keepioo USP (welfare/loan
   * 정책 가이드) 대비 외부 보도자료 비중이 과도하면 AdSense 검수 실패 위험. selective
   * noindex(summary+classified_at) 기준 적용 — 실제 index 후보만 카운트.
   */
  newsRatio: number;
  /**
   * 2026-05-31 추가 — AdSense 자동 트리거 Phase A. ADSENSE_REVIEW_MODE on 상태에서
   * P2 ai_commentary 백필이 80%+ 도달했는지 (review mode off 안전 가능 시점).
   * true = 텔레그램 알림 발화 + 사장님 Vercel env off 안내.
   */
  adsenseReadyToDisable: boolean;
  /**
   * 2026-05-31 추가 — Vercel PAT(VERCEL_TOKEN) 만료까지 일수. ENV
   * VERCEL_TOKEN_EXPIRES_AT (ISO 날짜) 미설정 시 null = alert X.
   * 0 ≤ N ≤ 7 시 alert (AdSense Phase B redeploy + 봇 /env /redeploy silent
   * fail 차단). 음수 = 이미 만료.
   */
  vercelTokenExpiresInDays: number | null;
  /**
   * 2026-05-17 추가 — 마지막 블로그 발행 이후 hours. 9999 = 발행 이력 0.
   * 5/15 spending cap 사고 (2.5일 무발행) 자동 감지. G1 quota 알림과 다른 진단 layer
   * (원인 vs 결과). GitHub Actions secret 만료·workflow disabled 도 잡음.
   * 평소 1~2 글/일 (GitHub Actions 매일 06:00 UTC).
   */
  blogPublishStaleHours: number;
  /**
   * 2026-06-07 P3 #6 — 자가 진화 학습 cron 7d 발화 횟수 (4 cron 합산: press_confidence·
   * popularity_weights·push_time_learn·digest). 매주 월 새벽 발화 → 평소 7d = 4건.
   * 0건 = 학습 파이프 전체 노쇼(Vercel 노쇼·secret 만료·endpoint 깨짐) → 사장님 주간
   * 텔레그램 다이제스트 누락 + 학습 효과 0 자각 못 함. (개별 cron 노쇼는 합산이라 미감지 —
   * 전체 노쇼만 감지하는 보수적 설계.)
   */
  selfLearningCronRunsLast7d: number;
  /**
   * welfare_programs unique_insight 커버리지(%). insight 없는 정책은 thin 방어로 noindex 라
   * 이 비율 = 색인 가능 복지 페이지 비중. 2026-06-11 enrich+백필로 57%→90%+ 달성.
   * floor(WELFARE_INSIGHT_COVERAGE_FLOOR, 기본 80) 미만 = 회귀 신호. 데이터 없으면 100.
   */
  welfareInsightCoveragePct: number;
};

export type ThresholdAlert = {
  key:
    | "low_activity"
    | "payment_fail"
    | "cron_fail"
    | "rate_limit_abuse"
    | "news_backlog"
    | "press_pending"
    | "press_no_show"
    | "press_low_tier"
    | "enrich_stuck"
    | "instagram_token_expiring"
    | "naver_cookies_expiring"
    | "policy_inflow_zero"
    | "collect_no_show"
    | "delivery_fail"
    | "loan_inflow_zero"
    | "naver_publish_failure"
    | "local_press_stale"
    | "local_press_collector_broken"
    | "local_press_insert_stop"
    | "local_press_cron_cadence"
    | "local_press_null_date"
    | "news_ratio_high"
    | "adsense_ready_to_disable"
    | "vercel_token_expiring"
    | "blog_publish_stalled"
    | "self_learning_cron_idle"
    | "welfare_insight_coverage_low";
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
// 가입 전 program_view/apply_click 도 실제 활동이다. user_events 7d 가 충분하면
// auth.users 기반 low_activity 는 false positive 로 본다.
const USER_EVENTS_7D_FLOOR = Number(
  process.env.HEALTH_USER_EVENTS_7D_FLOOR ?? "100",
);
// 정상 운영 baseline 보다 약간 여유 — false positive 톤 다운.
//
// 2026-05-14 — 1000 → 5000 (데이터 기반 fix).
// 진단: 5/9 cron 가동 시작 (cap 200 × 6 cron = 1200/일) 이후 14k backlog 해소 중.
// 신규 inflow ~270/일, 처리 ~1180/일 = net 감소 ~900/일. 12일 후 0 도달 추세.
// 임계 1000 으로는 12일 매일 false positive alert. 5000 = 정상 적체 흡수 12일 안 발화 +
// 그 후 cron 노쇼·OPENAI 다운 등 진짜 사고 시 (5000 도달까지 ~18일 누적) 알림.
const NEWS_BACKLOG_FLOOR = Number(
  process.env.NEWS_BACKLOG_ALERT_FLOOR ?? "5000",
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
// 2026-06-11 — welfare insight 커버리지 floor(%). enrich+백필로 ~90% 달성 후,
// 이 밑으로 떨어지면 회귀(파이프 중단·sparse 신규 급증). 사장님 목표치 80 을 기본 floor 로.
const WELFARE_INSIGHT_COVERAGE_FLOOR = Number(
  process.env.WELFARE_INSIGHT_COVERAGE_FLOOR ?? "80",
);
// Task 8 (2026-05-08) — low tier 큐 적체 임계.
// 2026-07-21 운영 데이터 기준 low confirm 0%, stale 14d+ 0건이면 30 미만은
// weekly reminder 대상이지 매일 health-alert 대상이 아니다. 30+ 부터 P3 monitor 로 발화.
const PRESS_LOW_TIER_FLOOR = Number(process.env.PRESS_LOW_TIER_FLOOR ?? "30");
// 2026-05-14 추가 — welfare + loan 24h inflow 임계.
// 정상 운영 일평균 ~50건 이상. 0건 = 수집 cron 사고 (즉시 알림).
// 1 = 적어도 1건은 들어와야 정상. 환경변수로 1분 toggle.
const POLICY_INFLOW_FLOOR = Number(process.env.POLICY_INFLOW_FLOOR ?? "1");
// 2026-05-14 추가 — /api/collect (GitHub Actions collect.yml) 노쇼 임계.
// 매일 KST 13:00 가동. 36h+ 흔적 없으면 GitHub Actions secret 만료 또는
// workflow disabled 사고. press_no_show 와 동일 패턴.
const COLLECT_NO_SHOW_HOURS = Number(
  process.env.COLLECT_NO_SHOW_ALERT_HOURS ?? "36",
);
// 2026-05-14 추가 — alert_deliveries status='failed' 24h 임계.
// 메타 사고 (alert 자체가 사장님께 안 가는 사고) 자동 감지.
// 12개 임계치 다 정상이어도 SMS·이메일 발송이 실패 누적되면 운영 신호 단절.
// 기본 5 — alert-dispatch 에 retry 메커니즘이 없어 일시 5xx 도 누적되므로
// CRON_FAIL 의 3 보다 buffer 1 단계 위 (subagent Warning-1 fix). 1주 모니터링 권장.
const DELIVERY_FAIL_THRESHOLD = Number(
  process.env.DELIVERY_FAIL_ALERT_THRESHOLD ?? "5",
);
// 최근 10분 fixed-window rate limit bucket 중 1분 카운트가 이 값 이상이면 abuse 후보.
// 실제 endpoint cap(20~60/min)보다 충분히 높게 두어 정상 사용·smoke noise 를 피한다.
const RATE_LIMIT_ABUSE_FLOOR = Number(process.env.RATE_LIMIT_ABUSE_FLOOR ?? "180");
// 2026-05-14 추가 — loan_programs 단독 노쇼 임계 (hours).
// 데이터 기반 발견: 합산 (welfare + loan) 임계는 welfare 7 + loan 0 = 7 통과로 loan 사고 가려짐.
// loan 30d 평균 ~16건/일이지만 일별 분산 큼 → 48h 보수 baseline (1주 모니터링 후 조정).
// welfare 가 정상 (>=1) 일 때만 발화 (둘 다 0 이면 policy_inflow_zero 가 우선 잡음 → 단일화).
const LOAN_INFLOW_ZERO_HOURS = Number(
  process.env.LOAN_INFLOW_ZERO_ALERT_HOURS ?? "48",
);
// 2026-05-14 추가 — 네이버 publish 실패율 임계 (codex 권장 spec).
// 5/13 사고: 24h 1,734건 시도 중 1,734건 fail (성공률 0.06%) — Vercel Playwright IP 차단 +
// legacy runner 잔존 가동 패턴. cookies 정상이라 cookies_expiring 임계로 못 잡음.
// 발화 조건: attempts >= FLOOR AND fail_rate >= 0.9 AND eligible_pending > 0.
// 셋 다 충족 시만 — false positive 차단 (PC 미가동 = attempts 0, 큐 비어있음 = pending 0).
const NAVER_PUBLISH_FAIL_FLOOR = Number(
  process.env.NAVER_PUBLISH_FAIL_FLOOR ?? "20",
);
const NAVER_PUBLISH_FAIL_RATE = Number(
  process.env.NAVER_PUBLISH_FAIL_RATE ?? "0.9",
);
// 2026-05-31 — null_date 도시 임계 (silent → audible 3단계). 1주 baseline 후 재평가.
// 기본 1 = 1개 도시만 발화. baseline noise 발생 시 ENV 로 2~3 으로 상향 가능.
const LOCAL_PRESS_NULL_DATE_CITY_FLOOR = Number(
  process.env.LOCAL_PRESS_NULL_DATE_CITY_FLOOR ?? "1",
);
// 2026-05-31 — news 비중 임계 (Google scaled content 정책 방어). 기본 0.6 = 60%.
// 1주 baseline 후 사장님 실 비율 확인하고 재조정 가능.
const NEWS_RATIO_HIGH_FLOOR = Number(
  process.env.NEWS_RATIO_HIGH_FLOOR ?? "0.6",
);
const NAVER_PUBLISH_FAIL_FLOOR_SAFE = Number.isFinite(NAVER_PUBLISH_FAIL_FLOOR)
  ? NAVER_PUBLISH_FAIL_FLOOR
  : 20;
const NAVER_PUBLISH_FAIL_RATE_SAFE = Number.isFinite(NAVER_PUBLISH_FAIL_RATE)
  ? NAVER_PUBLISH_FAIL_RATE
  : 0.9;
// 2026-05-17 — 시·군 보도자료 collector stale 임계.
// 20 시·군 중 N 이상이 72h 안 inserted 0 면 alert. 첫 cron 가동 후 baseline 누적까지
// noise 있을 수 있어 보수적 floor (10). 1주 모니터링 후 5 로 낮추는 방향.
const LOCAL_PRESS_STALE_FLOOR = Number(
  process.env.LOCAL_PRESS_STALE_FLOOR ?? "10",
);
// 2026-06-09 — 자가치유 감지 확장 collector 고장 alert 임계. ≥N 고장 시 텔레그램.
// 기본 1(collector 1개 깨져도 알림) — health-alert cooldown 이 중복 발화 억제하므로
// 스팸 X. no_audit 윈도우 timing false positive 가 잦으면 env 로 상향(2~3) 가능.
const LOCAL_PRESS_BROKEN_FLOOR = Number(
  process.env.LOCAL_PRESS_BROKEN_FLOOR ?? "1",
);
// 2026-05-17 — 블로그 발행 stalled 임계 (hours).
// 5/15 사고 (2.5일 = 60h 무발행) 자동 감지. 평소 1~2 글/일.
// G1 (Gemini quota 알림) 과 다른 진단 layer (원인 vs 결과) — 동시 발화 가능.
const BLOG_PUBLISH_STALE_HOURS = Number(
  process.env.BLOG_PUBLISH_STALE_HOURS ?? "60",
);

function formatStaleCityDetail(cities: string[]): string {
  if (cities.length === 0) return "";
  const shown = cities.slice(0, 10).join(", ");
  const more = cities.length > 10 ? ` 외 ${cities.length - 10}건` : "";
  return `${shown}${more}`;
}

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

  const { count: userEvents7dCount } = await sb
    .from("user_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since7dIso);
  const userEvents7d = userEvents7dCount ?? 0;

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

  const rateLimitStatus = await getRateLimitStatus({ lookbackMinutes: 10, limit: 5 });
  const rateLimitMaxCount = rateLimitStatus.maxCount;
  const rateLimitHotBuckets = rateLimitStatus.topBuckets;

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
  const lowTierCleanupCutoff = new Date(
    Date.now() - 14 * 24 * 3600_000,
  ).toISOString();
  const { count: lowTierCleanupEligibleCount } = await sb
    .from("press_ingest_candidates")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .eq("confidence_tier", "low")
    .lt("created_at", lowTierCleanupCutoff);
  const pressLowTierCleanupEligible = lowTierCleanupEligibleCount ?? 0;
  const pressAutoStats = await getPressAutoConfirmStats();
  const pressLowConfirmRate7d = pressAutoStats.low_confirm_rate_7d;
  const pressLowDecisions7d =
    pressAutoStats.low_confirmed_7d + pressAutoStats.low_rejected_7d;
  const pressLowConfirmRateHint = pressAutoStats.low_confirm_rate_hint;

  // 마지막 press cron 흔적 시간차 — 노쇼 진단.
  // 2026-05-14 — press_l2_classify 는 후보 처리한 만큼만 row 쌓여 false positive 위험
  // (06:30/10:30 cron 이 빈손으로 끝나면 row 안 쌓임). press_ingest_run 은 cron 가동 자체
  // 추적 (직전 commit 추가). 둘 중 하나만 있어도 cron 정상 가동으로 판정.
  const { data: lastPress } = await sb
    .from("admin_actions")
    .select("created_at")
    .in("action", ["press_l2_classify", "press_ingest_run"])
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

  // welfare insight 커버리지(%) — unique_insight 채워진 비율. AdSense thin 방어로 insight
  // 없는 정책은 noindex 되므로, 이 비율이 색인 가능 복지 페이지 비중이다. 2026-06-11
  // enrich(지자체·youth 상세수집)+백필 합산으로 57%→90%+ 달성. floor 미만 = 회귀(enrich
  // 파이프라인 중단·sparse 신규 정책 급증 등) 신호.
  const [welfTotal, welfInsight] = await Promise.all([
    sb.from("welfare_programs").select("*", { count: "exact", head: true }),
    sb
      .from("welfare_programs")
      .select("*", { count: "exact", head: true })
      .not("unique_insight", "is", null),
  ]);
  const welfareInsightCoveragePct =
    welfTotal.count && welfTotal.count > 0
      ? Math.round(((welfInsight.count ?? 0) / welfTotal.count) * 1000) / 10
      : 100; // 데이터 없으면 알림 X (100 으로 둠)

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

  // 2026-05-14 — /api/collect (GitHub Actions collect.yml KST 13:00) 노쇼 진단.
  // collect_run audit 흔적 시간차. 흔적 없으면 999 (반드시 alert).
  const { data: lastCollect } = await sb
    .from("admin_actions")
    .select("created_at")
    .eq("action", "collect_run")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const collectLastRunHours = lastCollect?.created_at
    ? Math.round(
        (Date.now() - new Date(lastCollect.created_at).getTime()) / 3600000,
      )
    : 999;

  // 2026-05-14 — 24h 정책 inflow (welfare/loan 분리).
  //
  // 데이터 기반 fix (2026-05-14 후속 #2 진단):
  //   직전 commit 09569f0 의 `auto_confirm_tier IS NOT NULL` 가드는 press-ingest path
  //   (광역 보도자료 → LLM 분류 → confirm) 만 카운트. **collector path** (mss·kinfa·fsc·
  //   bizinfo 등 vercel cron / GitHub Actions) 가 INSERT 한 row 는 auto_confirm_tier 가
  //   NULL 로 모두 무시됐음.
  //
  //   실제 데이터: 5/14 mss 99건 INSERT (loan_programs) 됐는데 query 결과 0 →
  //   loan_inflow_zero false positive 발화 보장. press-ingest 는 loan 거의 0건이라 사실상
  //   loan inflow 가 항상 0 으로 보였음.
  //
  //   manual_program_create (사장님 admin/manual) 는 빈도 거의 0 + manual 도 0 이면 사고
  //   진단에 도움 → 모든 INSERT 합산. source_code IS NOT NULL (collector·press-ingest)
  //   가드만 유지.
  const [welfNew, loanNew, lastLoan] = await Promise.all([
    sb
      .from("welfare_programs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since24Iso)
      .not("source_code", "is", null),
    sb
      .from("loan_programs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since24Iso)
      .not("source_code", "is", null),
    // loan 마지막 inflow 시각 (collector + press-ingest 양쪽 — manual 제외).
    sb
      .from("loan_programs")
      .select("created_at")
      .not("source_code", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const welfareInflow24h = welfNew.count ?? 0;
  const loanInflow24h = loanNew.count ?? 0;
  const policyInflow24h = welfareInflow24h + loanInflow24h;
  const loanLastInflowHours = lastLoan.data?.created_at
    ? Math.round(
        (Date.now() - new Date(lastLoan.data.created_at).getTime()) / 3600000,
      )
    : 999;

  // 2026-05-14 — 네이버 publish 24h 통계 + eligible pending (codex 권장 spec).
  // 발행 가능한 큐가 있는데 시도가 거의 다 fail = 진짜 사고. 셋 다 충족 시만 발화.
  const [naverAtt, naverFails, naverPending] = await Promise.all([
    sb
      .from("naver_publish_audit")
      .select("*", { count: "exact", head: true })
      .gte("attempted_at", since24Iso)
      .in("result", ["success", "fail"]),
    sb
      .from("naver_publish_audit")
      .select("*", { count: "exact", head: true })
      .gte("attempted_at", since24Iso)
      .eq("result", "fail"),
    sb
      .from("naver_blog_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")
      .lt("attempt_count", 3),
  ]);
  const naverPublishAttempts24h = naverAtt.count ?? 0;
  const naverPublishFails24h = naverFails.count ?? 0;
  const naverPublishEligiblePending = naverPending.count ?? 0;

  // 2026-05-17 — 시·군 보도자료 collector stale (72h 안 inserted 0 인 시·군 수).
  const localPressStaleCityNames = await getStaleCityNames(72);
  const localPressStaleCities = localPressStaleCityNames.length;
  const localPressStaleDetail = formatStaleCityDetail(localPressStaleCityNames);
  // 2026-06-09 — 자가치유 감지 확장. 23 GHA collector 진단(24h audit) → 고장 수 +
  // 도시·원인·제안 detail(텔레그램용). stale(72h)보다 민감해 조기 감지.
  const collectorDiagnoses = await getCollectorDiagnoses(24);
  const localPressBrokenCollectors = collectorDiagnoses.filter((d) =>
    isProblemStatus(d.status),
  ).length;
  const localPressCollectorDetail = formatCollectorProblems(collectorDiagnoses);
  // 2026-06-10 — 회귀형 silent insert-stop(목록 OK·최근 신규 0·이전 작동). 본문 추출
  // silent fail 조기 감지. baseline 비교라 transient(동작구)·저발행은 자동 제외.
  const insertStops = await getSustainedInsertStops();
  const localPressInsertStopped = insertStops.length;
  const localPressInsertStopDetail = formatInsertStops(insertStops);
  // 2026-06-10 — cron 완주(cadence) 저하. 실행빈도가 baseline 대비 급락(timeout/부분실패)
  // 을 GitHub API 없이 audit run 수로 감지. baseline 비교라 cadence 다른 collector 도 대응.
  const cadenceDrops = await getCadenceRegressions();
  const localPressCadenceDrops = cadenceDrops.length;
  const localPressCadenceDetail = formatCadenceRegressions(cadenceDrops);
  // 2026-05-30 — 24h null_date ≥5 누적 시·군 (factory date 추출 collector 점검 신호).
  const localPressNullDateCities = await getHighNullDateCityCount(5, 24);
  // 2026-05-30 — news 비중 (외부 보도자료 대 keepioo 자체 자산).
  const { ratio: newsRatio, commentaryBackfillRatio } = await getNewsRatio();
  // 2026-05-31 — AdSense 자동 트리거 Phase A. review mode on + 백필 ≥80% = off 안전.
  const adsenseReadyToDisable =
    ADSENSE_REVIEW_MODE && commentaryBackfillRatio >= 0.8;

  // 2026-05-31 — Vercel PAT 만료 일수 (ENV VERCEL_TOKEN_EXPIRES_AT ISO 날짜).
  const vercelTokenExpiresAt = process.env.VERCEL_TOKEN_EXPIRES_AT;
  const vercelTokenExpiresInDays = vercelTokenExpiresAt
    ? Math.floor(
        (new Date(vercelTokenExpiresAt).getTime() - Date.now()) /
          (24 * 3600_000),
      )
    : null;

  // 2026-05-17 — 블로그 발행 stalled (마지막 발행 이후 hours).
  const blogStats = await getBlogPublishStats();
  const blogPublishStaleHours = blogStats.hoursSinceLastPublish;

  // 2026-06-07 P3 #6 — 자가 진화 학습 cron(4종) 7d 발화 횟수. 0건 = 학습 파이프 전체 노쇼.
  // 2026-06-07 코드리뷰 P1 — push_time_learn_run 누락 보완(4종 전체로 정확도 ↑).
  const { count: learningRunsCount } = await sb
    .from("admin_actions")
    .select("id", { count: "exact", head: true })
    .in("action", [
      "press_confidence_tune_run",
      "popularity_weights_tune_run",
      "push_time_learn_run",
      "self_learning_digest_run",
    ])
    .gte("created_at", since7dIso);
  const selfLearningCronRunsLast7d = learningRunsCount ?? 0;

  return {
    signups24h,
    active7d,
    active7dAny,
    userEvents7d,
    failed24h,
    cronFailures24h,
    deliveryFailures24h,
    rateLimitMaxCount,
    rateLimitHotBuckets,
    newsBacklogTotal,
    pressPending,
    pressLastClassifyHours,
    enrichPermanentSkip,
    pressLowTierBacklog,
    pressLowTierCleanupEligible,
    pressLowConfirmRate7d,
    pressLowDecisions7d,
    pressLowConfirmRateHint,
    instagramTokenExpiresInDays,
    naverCookiesExpiresInDays,
    policyInflow24h,
    welfareInflow24h,
    loanInflow24h,
    loanLastInflowHours,
    naverPublishAttempts24h,
    naverPublishFails24h,
    naverPublishEligiblePending,
    collectLastRunHours,
    localPressStaleCities,
    localPressStaleDetail,
    localPressBrokenCollectors,
    localPressCollectorDetail,
    localPressInsertStopped,
    localPressInsertStopDetail,
    localPressCadenceDrops,
    localPressCadenceDetail,
    localPressNullDateCities,
    newsRatio,
    adsenseReadyToDisable,
    vercelTokenExpiresInDays,
    blogPublishStaleHours,
    selfLearningCronRunsLast7d,
    welfareInsightCoveragePct,
  };
}

// 임계치 점검 — health-alert cron 이 호출, 위반 항목만 반환
export function checkThresholds(s: HealthSignals): ThresholdAlert[] {
  const alerts: ThresholdAlert[] = [];

  // 가입 활성도 — auth users + anonymous/user event activity를 함께 본다.
  // keepioo는 검색·읽기 위주라 가입 전 program_view/apply_click이 충분하면 low_activity false positive.
  if (
    s.signups24h === 0 &&
    s.active7dAny < ACTIVE_7D_FLOOR &&
    s.userEvents7d < USER_EVENTS_7D_FLOOR
  ) {
    alerts.push({
      key: "low_activity",
      message: `24h 신규 가입 0 + 7d 활성(가입+로그인) ${s.active7dAny}명 + 7d 이벤트 ${s.userEvents7d}건 (< ${USER_EVENTS_7D_FLOOR}). 가입 funnel 점검 필요.`,
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

  if (s.rateLimitMaxCount >= RATE_LIMIT_ABUSE_FLOOR) {
    const top = s.rateLimitHotBuckets[0];
    alerts.push({
      key: "rate_limit_abuse",
      message: `최근 rate limit bucket 최대 ${s.rateLimitMaxCount}회/분 (임계 ${RATE_LIMIT_ABUSE_FLOOR}+). top=${top?.bucket ?? "unknown"}`,
      recommendation:
        "/api/agent/diagnose question=rate_limit_status 로 top bucket class 확인 → 필요 시 endpoint cap 조정 또는 WAF/IP 차단 검토",
    });
  }

  // 2026-05-14 — alert_deliveries status='failed' 24h 누적 (메타 사고 자동 감지).
  // cron 자체는 성공했는데 정작 SMS·이메일 발송이 실패한 케이스.
  // 12개 임계치가 다 정상이어도 alert 가 사장님께 안 가면 무용지물 → "alert 에 대한 alert".
  // Solapi 잔액 0·이메일 도메인 reputation 하락·OPENAI/카카오 API 다운 등 즉시 진단.
  //
  // 의도적 공존 (subagent Critical-2): kakao_high_failure (external-console-check cron, KST 09:30,
  // Solapi /messages/v4/list 24h 통계 ≥10% 실패율) 와 다른 진단 layer.
  // - kakao_high_failure: Solapi 외부 API 직접 통계 (실시간 외부 사고)
  // - delivery_fail: alert_deliveries DB 누적 패턴 (내부 발송 결과 적체)
  // 카카오 사고 시 SMS 2건 가능하지만 동일 사고의 두 view 라 사장님 진단 가속에 도움 (단일화 X).
  if (s.deliveryFailures24h >= DELIVERY_FAIL_THRESHOLD) {
    alerts.push({
      key: "delivery_fail",
      message: `24h 알림 발송 실패 ${s.deliveryFailures24h}건 (임계 ${DELIVERY_FAIL_THRESHOLD}+, alert_deliveries status=failed).`,
      recommendation:
        "/admin/alimtalk 에서 24h 실패 코드·사유 breakdown 확인 + Solapi 콘솔 잔액·Resend 도메인 reputation 점검 (kakao_high_failure 와 동시 발화 가능 — 같은 사고의 두 view)",
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

  // 광역 보도자료 검토 큐 적체 — 4 layer fallback 후에도 사장님 검토 대기.
  // 단, pending 전부가 low-tier 라면 아래 press_low_tier 가 같은 원인을 더 정확히
  // 설명하므로 generic press_pending 은 중복 발화하지 않는다.
  const pressPendingIsOnlyLowTier =
    s.pressPending > 0 && s.pressPending === s.pressLowTierBacklog;
  if (s.pressPending >= PRESS_PENDING_FLOOR && !pressPendingIsOnlyLowTier) {
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
    const cleanupNote =
      s.pressLowTierCleanupEligible > 0
        ? `cleanup dry-run 대상 ${s.pressLowTierCleanupEligible}건 있음 — press-legacy-cleanup-dry 먼저 확인.`
        : "cleanup 대상 0건이면 자동 reject 대신 /admin/press-ingest 수동 검수/관찰 유지.";
    alerts.push({
      key: "press_low_tier",
      message: `LLM 신뢰도 'low' 큐 ${s.pressLowTierBacklog}건 (임계 ${PRESS_LOW_TIER_FLOOR}+). cleanup 대상 ${s.pressLowTierCleanupEligible}건, 7d low 결정 ${s.pressLowDecisions7d}건/confirm ${s.pressLowConfirmRate7d}%.`,
      recommendation:
        `${cleanupNote} 최근 low 판단: ${s.pressLowConfirmRateHint}. AUTO_CONFIRM_TIER_FLOOR=low 는 low confirm rate 가 충분히 높을 때만 신중히 검토.`,
    });
  }

  // enrich detail-fetcher 영구 skip 폭증 — 외부 API 일관 실패.
  // permanent skip 은 누적값이라 한 번 floor 를 넘으면 건강 알림을 계속 오염시킬 수 있다.
  // insight 커버리지가 이미 정상권이면 즉시 장애보다 cleanup backlog 로 취급한다.
  if (s.enrichPermanentSkip >= ENRICH_PERMANENT_SKIP_FLOOR) {
    if (s.welfareInsightCoveragePct < WELFARE_INSIGHT_COVERAGE_FLOOR) {
      alerts.push({
        key: "enrich_stuck",
        message: `enrich 영구 skip 누적 ${s.enrichPermanentSkip}건 (임계 ${ENRICH_PERMANENT_SKIP_FLOOR}+).`,
        recommendation:
          "/admin/enrich-detail 에서 일괄 해제 검토 (외부 API 회복 시) 또는 collector 점검",
      });
    }
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

  // 2026-06-07 P3 #6 — 자가 진화 학습 cron 7d 0건 = 운영 자가 진화 멈춤.
  // SELF_LEARNING_CRON_ALERT_AFTER(예: 2026-06-08) 이후만 활성 — 첫 cycle(6/1) 전
  // false positive 차단. 미설정 시 비활성(안전 기본값, 환경변수 등록 전 오탐 0).
  const selfLearningAlertAfter = process.env.SELF_LEARNING_CRON_ALERT_AFTER;
  const selfLearningAlertActive = selfLearningAlertAfter
    ? new Date() >= new Date(selfLearningAlertAfter)
    : false;
  if (selfLearningAlertActive && s.selfLearningCronRunsLast7d === 0) {
    alerts.push({
      key: "self_learning_cron_idle",
      message:
        "자가 진화 학습 cron 7d 동안 0건 발화 — Vercel cron schedule 또는 endpoint 점검 필요",
      recommendation:
        "vercel.json crons 검증 + /admin/cron-trigger 에서 수동 trigger 시도. 사장님 주간 텔레그램 다이제스트 누락 진단.",
    });
  }

  // 2026-06-11 — welfare insight 커버리지 회귀 가드. enrich+백필로 ~90% 달성 후 floor(80%)
  // 밑으로 떨어지면 알림. insight 없는 복지는 noindex 라 커버리지 하락 = 색인 가능 페이지 감소
  // = SEO·AdSense 손실. sparse 신규 정책 급증·enrich/백필 파이프 중단 시 발화.
  if (s.welfareInsightCoveragePct < WELFARE_INSIGHT_COVERAGE_FLOOR) {
    alerts.push({
      key: "welfare_insight_coverage_low",
      message: `welfare insight 커버리지 ${s.welfareInsightCoveragePct}% (임계 ${WELFARE_INSIGHT_COVERAGE_FLOOR}% 미만). 색인 가능 복지 페이지 비중 하락.`,
      recommendation:
        "enrich(playwright/enrich-bokjiro.mjs·enrich-youth.mjs) + 백필 cron 점검. sparse 신규 정책 급증이면 상세수집 재가동.",
    });
  }

  // 2026-05-14 — 정책 inflow 0건 (수집 cron 사고 즉시 감지).
  // collector + press-ingest 합산 카운트 (source_code IS NOT NULL).
  // manual_program_create (admin 수동 등록 — source_code NULL) 만 noise 라 제외.
  // 직전 commit 0dc39d4 fix — auto_confirm_tier 가드는 collector path 99건/일 무시.
  //
  // 주말 (토/일 KST) skip — 광역 보도자료 출처 사이트 휴재로 자연 0건 가능.
  // 평일 만 alert (subagent Critical-2 fix).
  //
  // press_no_show 와 중복 발화 단일화 — press_no_show 가 이미 발화 중이면
  // 같은 사고 (press-ingest cron 노쇼) 라 SMS 1통으로 압축 (subagent Warning-3 fix).
  const kstNow = new Date(Date.now() + 9 * 3600_000);
  const kstDayOfWeek = kstNow.getUTCDay(); // 0=Sun 6=Sat
  const isWeekend = kstDayOfWeek === 0 || kstDayOfWeek === 6;
  const pressNoShowFiring = s.pressLastClassifyHours >= PRESS_NO_SHOW_HOURS;
  // 2026-05-14 — /api/collect (GitHub Actions collect.yml) 노쇼 자동 감지.
  // 매일 KST 13:00 가동. 36h+ 흔적 없으면 GitHub Actions 사고 (secret 만료·workflow disabled).
  if (s.collectLastRunHours >= COLLECT_NO_SHOW_HOURS) {
    alerts.push({
      key: "collect_no_show",
      message: `/api/collect 마지막 ${s.collectLastRunHours}h 전 (임계 ${COLLECT_NO_SHOW_HOURS}h+, GitHub Actions collect.yml).`,
      recommendation:
        "GitHub Actions 의 collect.yml workflow 최근 실행 결과 + secret (CRON_SECRET·DATA_GO_KR_API_KEY) 만료 확인. 수동 trigger: gh workflow run collect.yml",
    });
  }

  if (!isWeekend && !pressNoShowFiring && s.policyInflow24h < POLICY_INFLOW_FLOOR) {
    alerts.push({
      key: "policy_inflow_zero",
      message: `24h 정책 inflow ${s.policyInflow24h}건 (welfare ${s.welfareInflow24h} + loan ${s.loanInflow24h}, 임계 ${POLICY_INFLOW_FLOOR}+, collector + press-ingest 합산). 수집 cron 사고 의심.`,
      recommendation:
        "1) /admin/cron-trigger 에서 press-ingest 수동 실행 2) GitHub Actions `collect.yml` workflow 최근 실행 결과 확인 (KST 13:00 자동 — data.go.kr quota 진단 포함) 3) admin_actions 의 collect_run / press_ingest_run 24h 흔적 확인. POLICY_INFLOW_FLOOR=0 으로 1분 비활성 가능.",
    });
  }

  // 2026-05-14 — loan 단독 노쇼 (welfare 가 합산을 마스킹하는 사고 방지).
  // 데이터 기반 발견 (5/14): welfare 7 + loan 0 = 합산 7 → 임계 통과 → loan 사고 가려짐.
  // welfare 가 정상 (>=1) 일 때만 발화 — 둘 다 0 이면 policy_inflow_zero 가 우선 잡음 (단일화).
  // 평일 + welfare 정상 + loan last inflow >= 48h 동시 충족 시 발화.
  // 임계 48h — loan 일별 분산이 커서 24h 는 false positive 위험 (kinfa 같은 출처 휴재 가능).
  //
  // 의도적 공존 (subagent Improvement-3): press_no_show 와 다른 진단 layer.
  // - press_no_show: 광역 보도자료 cron (vercel cron) 노쇼
  // - loan_inflow_zero: loan-only 출처 (collect.yml workflow_dispatch 가능) 노쇼
  // 동시 발화 시 사장님 SMS 2건 — 다른 진단 출발점이라 진단 가속에 도움.
  if (
    !isWeekend &&
    s.welfareInflow24h >= 1 &&
    s.loanLastInflowHours >= LOAN_INFLOW_ZERO_HOURS
  ) {
    alerts.push({
      key: "loan_inflow_zero",
      message: `loan 단독 노쇼 — 마지막 ${s.loanLastInflowHours}h 전 (임계 ${LOAN_INFLOW_ZERO_HOURS}h+, welfare ${s.welfareInflow24h}건은 정상). loan-only 출처 (kinfa 등) cron 사고 의심.`,
      recommendation:
        "GitHub Actions `collect.yml` workflow_dispatch 로 kinfa·smes·sbiz24·semas-policy-fund 재실행 + data.go.kr quota / 출처 사이트 형식 변경 진단. LOAN_INFLOW_ZERO_ALERT_HOURS env 로 1분 toggle.",
    });
  }

  // 2026-05-14 — 네이버 publish 실패율 임계 (codex 권장 spec).
  // 셋 다 충족 시만: attempts >= FLOOR (표본) AND fail_rate >= 0.9 (사고 강도)
  // AND eligible_pending > 0 (큐 있음 — 정상 운영 가정).
  // PC 미가동 = attempts 0 → 발화 X (false positive 차단).
  // 큐 비어있음 = pending 0 → 발화 X (정상).
  if (
    s.naverPublishAttempts24h >= NAVER_PUBLISH_FAIL_FLOOR_SAFE &&
    s.naverPublishFails24h / Math.max(s.naverPublishAttempts24h, 1) >=
      NAVER_PUBLISH_FAIL_RATE_SAFE &&
    s.naverPublishEligiblePending > 0
  ) {
    const failRate = Math.round(
      (s.naverPublishFails24h / s.naverPublishAttempts24h) * 100,
    );
    alerts.push({
      key: "naver_publish_failure",
      message: `네이버 publish 24h 실패율 ${failRate}% (${s.naverPublishFails24h}/${s.naverPublishAttempts24h}, pending ${s.naverPublishEligiblePending}건). Playwright IP 차단 또는 legacy runner 잔존 가동 의심.`,
      recommendation:
        "/admin/naver-blog 의 audit details->>'runner' 분포 확인. legacy-cron-playwright 다수면 NAVER_PLAYWRIGHT_ENABLED 미설정 확인. local-playwright 다수면 사장님 노트북 runner.mjs 종료. Chrome Extension pivot 정상 가동 시 runner='chrome-extension' 으로 잡힘.",
    });
  }

  // 2026-05-17 — 시·군 보도자료 collector stale (72h 안 inserted 0 인 시·군 수).
  // 20 시·군 중 N 이상 stale = collector regex 깨졌거나 사이트 구조 변경.
  // 첫 cron 가동 baseline 누적까지 noise 대비 보수적 floor 10 (LOCAL_PRESS_STALE_FLOOR env).
  if (s.localPressStaleCities >= LOCAL_PRESS_STALE_FLOOR) {
    alerts.push({
      key: "local_press_stale",
      message: `시·군 보도자료 collector stale ${s.localPressStaleCities}건 (임계 ${LOCAL_PRESS_STALE_FLOOR}+). 최근 72h inserted 0 시·군 수.`,
      recommendation:
        s.localPressStaleDetail
          ? `stale 도시: ${s.localPressStaleDetail}\n/admin/autonomous 의 시·군 카드 확인 → 오류 시·군 사이트 직접 접속해 selector 점검. KST 09:00 cron 다음 회차 자동 재시도. 3 회차 연속 실패 시 lib/scraping/local-press/{city}.ts regex 수정 필요.`
          : "/admin/autonomous 의 시·군 카드 확인 → 오류 시·군 사이트 직접 접속해 selector 점검. KST 09:00 cron 다음 회차 자동 재시도. 3 회차 연속 실패 시 lib/scraping/local-press/{city}.ts regex 수정 필요.",
    });
  }

  // 2026-06-09 — 자가치유 감지 확장. 23 GHA collector 진단(24h)에서 고장(no_audit·
  // list_broken·body_fail) ≥1 면 도시·원인·수리제안을 텔레그램에 첨부. stale(floor 10)
  // 보다 민감해 collector 1개 깨져도 조기 감지. health-alert cooldown 이 중복 억제.
  if (s.localPressBrokenCollectors >= LOCAL_PRESS_BROKEN_FLOOR) {
    alerts.push({
      key: "local_press_collector_broken",
      message: `지역뉴스 collector 고장 ${s.localPressBrokenCollectors}건 (GHA 23도시 자가치유 24h 감지).`,
      recommendation:
        s.localPressCollectorDetail ||
        "/admin/autonomous 자율 허브에서 collector 상태 확인",
    });
  }

  // 2026-06-10 — 회귀형 silent insert-stop. 목록은 꾸준히 가져오나(fetched>0) 최근 신규
  // insert 0 + 이전엔 작동(회귀). error 없는 silent 본문 추출 실패 / BODY_MIN_LEN 250 급감.
  // baseline 비교라 동작구류 transient·저발행 collector 는 자동 제외(오탐 ↓). 1건만 떠도 알림.
  if (s.localPressInsertStopped >= 1) {
    alerts.push({
      key: "local_press_insert_stop",
      message: `지역뉴스 신규수집 끊김 ${s.localPressInsertStopped}건 (목록 OK·최근 신규 0·이전엔 작동=회귀).`,
      recommendation:
        s.localPressInsertStopDetail ||
        "본문 추출 silent fail 의심 — 해당 사이트 본문 글자수·BODY_MIN_LEN 점검",
    });
  }

  // 2026-06-10 — cron 완주(cadence) 저하. 실행빈도가 baseline 대비 급락(GHA timeout 으로
  // 뒷순서 도시 누락 등 부분실패). GitHub API 없이 audit run 수로 감지. 2026-06-09 timeout
  // 사고(몇 주간 안 보였던) 영구 가드. baseline 비교라 신규/저빈도는 자동 제외, 1건만 떠도 알림.
  if (s.localPressCadenceDrops >= 1) {
    alerts.push({
      key: "local_press_cron_cadence",
      message: `지역뉴스 cron 완주 저하 ${s.localPressCadenceDrops}건 (실행빈도 baseline 대비 급락=timeout/부분실패 의심).`,
      recommendation:
        s.localPressCadenceDetail ||
        "GHA local-press-proxy run cancelled 여부 + timeout-minutes 점검",
    });
  }

  // 2026-05-30 — 시·군 collector 의 published_at silent now-fallback 누적 (24h ≥5 도시).
  // factory date selector 깨졌거나 사이트 구조 변경 → 모든 글이 수집시각으로 잡혀
  // NewsArticle schema 신뢰도 ↓ + 사용자 "오늘 새 정책" 알림 거짓 발화 위험.
  if (s.localPressNullDateCities >= LOCAL_PRESS_NULL_DATE_CITY_FLOOR) {
    alerts.push({
      key: "local_press_null_date",
      message: `시·군 published_at silent fallback ${s.localPressNullDateCities}개 도시 (임계 ${LOCAL_PRESS_NULL_DATE_CITY_FLOOR}+, 24h null_date ≥5 누적). factory date 추출 점검 신호.`,
      recommendation:
        "/admin/autonomous 의 시·군 카드에서 '날짜 미상 N' 표시 도시 확인 → 사이트 직접 접속해 list row 의 등록일 cell 구조 변경 확인. playwright/lib/_factory.mjs 의 date selector (td.date/.date/.reg/td.td-date) 또는 도시별 listSelectors 조정 필요.",
    });
  }

  // 2026-05-31 — AdSense 자동 트리거 Phase A. ADSENSE_REVIEW_MODE on + 백필 80% 도달 시
  // 사장님이 Vercel env off 안전 시점 자동 안내. 매일 1회 발화 (1-tap 액션 가이드).
  // 2026-05-31 — Vercel PAT 만료 임박. AdSense Phase B + 봇 /env /redeploy silent fail 차단.
  if (
    s.vercelTokenExpiresInDays !== null &&
    s.vercelTokenExpiresInDays <= 7
  ) {
    const expired = s.vercelTokenExpiresInDays < 0;
    alerts.push({
      key: "vercel_token_expiring",
      message: expired
        ? `Vercel PAT 이미 만료 (${Math.abs(s.vercelTokenExpiresInDays)}일 전). AdSense Phase B 자동 off + 봇 /env /redeploy 모두 401 실패 중.`
        : `Vercel PAT 만료 ${s.vercelTokenExpiresInDays}일 남음 (≤ 7일). 갱신 안 하면 AdSense Phase B + 봇 /env /redeploy 모두 silent fail.`,
      recommendation:
        "Vercel account settings → Tokens → 새 PAT 발급 (1년) → Vercel 환경변수 VERCEL_TOKEN 갱신 + VERCEL_TOKEN_EXPIRES_AT (ISO 날짜) 동시 갱신 → production redeploy. project scope 필수.",
    });
  }

  if (s.adsenseReadyToDisable) {
    alerts.push({
      key: "adsense_ready_to_disable",
      message: `AdSense P2 ai_commentary 백필 ≥80% 도달 — review mode off 안전 시점.`,
      recommendation:
        "사장님 1-tap: https://www.keepioo.com/api/admin/disable-adsense-review-mode (admin 로그인 후 GET 으로 confirm page 진입 → 빨간 버튼 클릭 → Vercel ENV adsense-approved-live-ads + production redeploy). 또는 수동: Vercel settings → env → NEXT_PUBLIC_ADSENSE_REVIEW_MODE=adsense-approved-live-ads + redeploy.",
    });
  }

  // 2026-05-30 — news 비중 ≥0.6 = Google "Scaled content abuse" 정책 의심 표면.
  // keepioo USP (welfare/loan 자체 가이드) 대비 외부 보도자료 비중 과도. AdSense
  // 검수자 시각에서 "주요 목적이 외부 콘텐츠 자동 복제" 로 잘못 판정될 위험.
  if (s.newsRatio >= NEWS_RATIO_HIGH_FLOOR) {
    alerts.push({
      key: "news_ratio_high",
      message: `news 비중 ${(s.newsRatio * 100).toFixed(1)}% (임계 ${(NEWS_RATIO_HIGH_FLOOR * 100).toFixed(0)}%+). Google scaled content 정책 의심 표면 — keepioo USP 대비 외부 보도자료 비중 과도.`,
      recommendation:
        "1) welfare/loan 신규 collector 점검 (수집 cron 노쇼 시 비율 자연 상승) 2) news selective noindex 임계 강화 검토 (현재 summary+classified_at, body length 추가 고려) 3) news 도시별 자체 해설 박스(PolicyGuideBox 등) 추가로 originality 보강.",
    });
  }

  // 2026-05-17 — 블로그 발행 stalled (5/15 spending cap 사고 재발 방지).
  // 평소 1~2 글/일 (GitHub Actions 매일 06:00 UTC). 60h+ 무발행 = 사고.
  // G1 (Gemini quota 알림, publish-blog route 직접 발화) 과 다른 진단 layer
  // (원인 vs 결과) — 동시 발화 가능. GitHub Actions secret/workflow 사고도 잡음.
  if (s.blogPublishStaleHours >= BLOG_PUBLISH_STALE_HOURS) {
    alerts.push({
      key: "blog_publish_stalled",
      message: `블로그 발행 ${s.blogPublishStaleHours}h+ 무발행 (임계 ${BLOG_PUBLISH_STALE_HOURS}h+). 5/15 spending cap 사고 패턴.`,
      recommendation:
        "1) Google AI Studio 의 keepioo project Spending cap 잔액 확인 2) GitHub Actions publish-blog workflow 최근 실행 결과 (gh run list -w publish-blog) 3) /admin/autonomous 의 블로그 발행 카드 확인. BLOG_PUBLISH_STALE_HOURS env 로 임계 1분 조정.",
    });
  }

  return alerts;
}
