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

export type PendingExternalAction = {
  /** 카테고리 — UI grouping */
  category: "security" | "oauth" | "automation" | "checkout" | "infrastructure" | "adsense";
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
        "Chrome paste hijack 사고 (5/18) 후속 — 26 도메인 재사용 비밀번호 변경 + Render API key revoke. 완료 후 클로드에게 '보안 회전 완료' 알려주면 자동 hide.",
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
  if (!renderUpgraded) {
    actions.push({
      category: "infrastructure",
      label: residentCycleActive
        ? "Render Starter plan ($7/월) — 선택적"
        : "Render Starter plan 업그레이드 ($7/월)",
      description: residentCycleActive
        ? "agent-resident-cycle in-site cron 가동 중 — Render free 유지 가능. Codex sidecar always-on 필요 시 Starter 권장 (선택)."
        : "Codex sidecar 82분 cycle 사고 (5/18 진단, 의도 30분) — Render free plan 15분 idle sleep 이 원인. Starter plan ($7/월) 으로 always-on. W1 ramp-up (5/25) 전 권장.",
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

  return actions;
}
