// ============================================================
// 사장님 외부 액션 잔여 자동 감지 — /admin/autonomous 상단 reminder
// ============================================================
// 5/18 메가 세션 누적 외부 액션 가이드 3건 + 메모리 다른 영역의 잔여.
// env 검사 + admin_actions audit 검사 + 메모리 기반 정적 항목 통합.
//
// 사장님 매일 hub 30초 점검 시 한눈에 잔여 액션 인지 — 잊지 않도록.
// 액션 완료 시 자동 hide (env 등록·audit row 발생·메모리 audit 도입 시).
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { checkW1Readiness } from "@/lib/codex/w1-readiness";
import { getAdsensePlacementSummary } from "@/lib/analytics/adsense-placement-status";

export type PendingExternalAction = {
  /** 카테고리 — UI grouping */
  category: "security" | "oauth" | "automation" | "checkout" | "infrastructure" | "adsense" | "codex";
  /** 짧은 라벨 (3~6 단어) */
  label: string;
  /** 사장님 액션 한 줄 설명 */
  description: string;
  /** 외부 URL 또는 사이트 내 link */
  url?: string;
  /** 가이드 문서 path (사이트 내 docs/ 또는 외부 link) */
  guideUrl?: string;
  /** 예상 소요 (분) */
  estimatedMinutes: number;
};

export async function getPendingExternalActions(): Promise<PendingExternalAction[]> {
  const actions: PendingExternalAction[] = [];

  // 1. 보안 회전 — security_rotation_done audit 있으면 자동 hide (2026-05-19 도입).
  //    사장님이 회전 완료 신고 (`/api/admin/mark-security-rotation` 또는 클로드 SQL) 시 hide.
  let securityRotated = false;
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "security_rotation_done");
    securityRotated = (count ?? 0) > 0;
  } catch {
    // DB 실패 시 보수적으로 reminder 노출 유지
  }
  if (!securityRotated) {
    actions.push({
      category: "security",
      label: "보안 회전 (cgc0301! + RENDER_API_KEY)",
      description:
        "Chrome paste hijack 사고 (5/18) 후속 — 26 도메인 재사용 비밀번호 변경 + Render API key revoke. 완료 후 /api/admin/mark-security-rotation 호출 (admin 로그인 + URL 1 click).",
      url: "/api/admin/mark-security-rotation",
      guideUrl:
        "https://github.com/keeper0301/government-information/blob/master/docs/external-actions/security-rotation-2026-05-18.md",
      estimatedMinutes: 10,
    });
  }

  // 2026-05-19 — Render Starter plan 업그레이드 (Codex sidecar 82분 cycle 사고)
  // [[codex-sidecar-cycle-diagnosis]] 참조 — free cold start 가 30분 cycle 깸.
  // 단 사장님이 5/19 agent-resident-cycle in-site cron 도입 → fallback 가동 시 권장 강도 ↓.
  let renderUpgraded = false;
  let residentCycleActive = false;
  try {
    const admin = createAdminClient();
    const [renderRes, residentRes] = await Promise.all([
      admin
        .from("admin_actions")
        .select("id", { count: "exact", head: true })
        .eq("action", "render_plan_upgraded"),
      // agent_diagnose_run 24h 중 site_resident_cron source 가 1건+ 이면 in-site fallback 가동
      admin
        .from("admin_actions")
        .select("id", { count: "exact", head: true })
        .eq("action", "agent_diagnose_run")
        .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())
        .filter("details->>source", "eq", "site_resident_cron"),
    ]);
    renderUpgraded = (renderRes.count ?? 0) > 0;
    residentCycleActive = (residentRes.count ?? 0) > 0;
  } catch {
    // DB 실패 시 보수적으로 reminder 노출 유지
  }
  if (!renderUpgraded && !residentCycleActive) {
    actions.push({
      category: "infrastructure",
      label: "Render Starter plan 업그레이드 ($7/월)",
      description:
        "Codex sidecar 82분 cycle 사고 (5/18 진단, 의도 30분) — Render free plan 15분 idle sleep 이 원인. Starter plan ($7/월) 으로 always-on. W1 ramp-up (5/25) 전 권장.",
      url: "https://dashboard.render.com/web/srv-d84vlgek1jcs73andjbg",
      estimatedMinutes: 3,
    });
  }

  // 2. Gmail OAuth — env 검사 (3종 중 1건이라도 없으면 노출)
  const gmailReady =
    !!process.env.GMAIL_CLIENT_ID &&
    !!process.env.GMAIL_CLIENT_SECRET &&
    !!process.env.GMAIL_REFRESH_TOKEN;
  if (!gmailReady) {
    actions.push({
      category: "oauth",
      label: "Gmail OAuth refresh_token 발급",
      description:
        "AdSense 검수 결과 Gmail 이메일 자동 파싱 (D 옵션) 가동용. blogfury project 의 기존 OAuth Client 재사용 가능",
      url: "https://developers.google.com/oauthplayground/",
      guideUrl:
        "https://github.com/keeper0301/government-information/blob/master/docs/external-actions/adsense-gmail-watch-spec.md",
      estimatedMinutes: 5,
    });
  }

  // 2026-05-19 — AdSense 검수 결과 + 광고 게재 env 통합 감지.
  // state=READY + NEXT_PUBLIC_ADSENSE_ID 등록 시 hide.
  // state=DISABLED 또는 env 누락 시 reminder.
  try {
    const admin = createAdminClient();
    const { data: latestAdsense } = await admin
      .from("admin_actions")
      .select("details")
      .eq("action", "adsense_review_state")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const adsenseState = (latestAdsense?.details as { state?: string } | null)?.state;
    const adsenseEnvReady = !!process.env.NEXT_PUBLIC_ADSENSE_ID;
    if (adsenseState === "DISABLED" || adsenseState === "CLOSED") {
      actions.push({
        category: "adsense",
        label: "AdSense 거절 사유 확인 + fix",
        description: `state=${adsenseState}. AdSense 콘솔에서 거절 사유 확인 후 메모리 [adsense-rejection-response] 따라 1~2주 fix 누적 후 재신청.`,
        url: "https://adsense.google.com/",
        guideUrl:
          "https://github.com/keeper0301/government-information/blob/master/docs/external-actions/adsense-post-decision-actions.md",
        estimatedMinutes: 10,
      });
    } else if (adsenseState === "READY" && !adsenseEnvReady) {
      actions.push({
        category: "adsense",
        label: "AdSense 광고 게재 env 등록",
        description: "검수 통과 (READY) 후 NEXT_PUBLIC_ADSENSE_ID env 등록 필요. 광고 단위 slot + layout 추가 권장.",
        url: "https://vercel.com/keeper0301-8938s-projects/government-information/settings/environment-variables",
        guideUrl:
          "https://github.com/keeper0301/government-information/blob/master/docs/external-actions/adsense-post-decision-actions.md",
        estimatedMinutes: 5,
      });
    }
  } catch {
    // DB 실패 시 noop — false reminder 차단
  }

  // 2026-05-25 — Codex W0 → W1 ramp-up 자동 검증.
  // spec [2026-05-25-codex-w0-to-w1-rampup] 의 Step 1 SQL 자동 실행.
  // 임계 충족 시 사장님 reminder (GitHub PAT + AGENT_W1_ENABLED env).
  // 2026-05-19 — windowReached=true && !ready 케이스도 reminder (미달 사유 가시화).
  try {
    const w1 = await checkW1Readiness();
    if (w1.windowReached && w1.ready) {
      actions.push({
        category: "codex",
        label: "Codex W1 ramp-up 활성화 (1주차 검증 통과)",
        description: `W0 7일 누적 ${w1.totalRuns7d}건·unique ${w1.uniqueQuestions}·errors ${(w1.errorRate * 100).toFixed(1)}% — 모든 임계 충족. GitHub PAT 발급 + AGENT_W1_ENABLED=true env 등록.`,
        guideUrl:
          "https://github.com/keeper0301/government-information/blob/master/docs/superpowers/specs/2026-05-25-codex-w0-to-w1-rampup.md",
        estimatedMinutes: 5,
      });
    } else if (w1.windowReached && !w1.ready) {
      actions.push({
        category: "codex",
        label: "Codex W1 임계 미달 — W0 추가 가동 또는 임계 재검토",
        description: `5/25 도달했으나 임계 미달: ${w1.reasons.join(" / ")}. W0 cron 가동 점검 또는 임계 (800 runs·10 questions·5% err) 재검토 필요.`,
        guideUrl:
          "https://github.com/keeper0301/government-information/blob/master/docs/superpowers/specs/2026-05-25-codex-w0-to-w1-rampup.md",
        estimatedMinutes: 10,
      });
    }
  } catch {
    // graceful — DB 실패 시 noop
  }

  // 3. Naver Extension — 5/13 push 후 admin_actions audit 0건 = 가동 안 됨
  try {
    const admin = createAdminClient();
    const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { count } = await admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .in("action", [
        "naver_publish_success",
        "naver_publish_fail",
        "naver_extension_publish",
        "naver_cookies_uploaded",
      ])
      .gte("created_at", since7d);
    if ((count ?? 0) === 0) {
      actions.push({
        category: "automation",
        label: "Naver Extension 설치·secret·dry-run",
        description:
          "5/13 코드 push 후 1주 가동 0건. 사장님 본체 PC 에 Manifest V3 Extension 설치 + popup secret 입력 + dry-run 1건 검증 필요",
        guideUrl:
          "https://github.com/keeper0301/government-information/blob/master/docs/external-actions/naver-extension-desktop-setup.md",
        estimatedMinutes: 10,
      });
    }
  } catch {
    // DB 실패는 silent — UI 차라리 안 보이는 게 안전 (false reminder 차단)
  }

  // 2026-05-22 — AdSense placement 위치별 unit 등록 자동 감지.
  // 5 placement (home/list/detail/category/eligibility) 중 1건 이상 미등록 시 reminder.
  // SLOT_INFEED default fallback 가동 중이면 사이트 영향 0, 분석만 통합.
  const adsensePlacement = getAdsensePlacementSummary();
  if (
    adsensePlacement.defaultFallback &&
    adsensePlacement.registeredCount < adsensePlacement.totalCount
  ) {
    const remaining =
      adsensePlacement.totalCount - adsensePlacement.registeredCount;
    actions.push({
      category: "adsense",
      label: `AdSense placement 미등록 ${remaining}/${adsensePlacement.totalCount}`,
      description: `5/22 placement 분리 인프라 push 완료 (commit 74cb64c). AdSense console 에서 ${remaining} 위치 ad unit 생성 후 NEXT_PUBLIC_ADSENSE_SLOT_/LAYOUT_ Vercel env 등록. 미등록은 default fallback 으로 동작.`,
      url: "https://adsense.google.com/adsense/u/0/pub-5310204530716694/myads",
      estimatedMinutes: 15,
    });
  }

  // 2026-05-22 — Playwright Phase 1 GitHub secrets 자동 감지.
  // 4 city (changwon/seongnam/ansan/cheonan) 의 news_posts row 가 24h 안에 있으면
  // = GitHub Actions cron 가동 = secrets 등록 완료 → hide.
  // 24h row 0 = 미등록 또는 cron 미실행 → reminder.
  try {
    const admin = createAdminClient();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const playwrightCityKeys = ["changwon", "seongnam", "ansan", "cheonan"];
    const sourceCodes = playwrightCityKeys.map((k) => `local-press-${k}`);
    const { count } = await admin
      .from("news_posts")
      .select("id", { count: "exact", head: true })
      .in("source_code", sourceCodes)
      .gte("created_at", since24h);
    const playwrightActive = (count ?? 0) > 0;
    if (!playwrightActive) {
      actions.push({
        category: "automation",
        label: "Playwright Phase 1 GitHub secrets (4 시)",
        description:
          "5/22 Playwright Phase 1 인프라 push 완료. GitHub repo settings → Secrets and variables → Actions 에서 KEEPIOO_API_URL + KEEPIOO_API_KEY 등록 + workflow_dispatch 1회 수동 trigger.",
        url: "https://github.com/keeper0301/government-information/settings/secrets/actions",
        estimatedMinutes: 5,
      });
    }
  } catch {
    // DB 실패는 silent
  }

  return actions;
}
