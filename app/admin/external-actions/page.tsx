// ============================================================
// /admin/external-actions — 사장님 외부 액션 가이드 hub (2026-05-19)
// ============================================================
// 5/18 메가 세션 누적 5건 외부 액션 가이드 문서 통합 link.
// 사장님이 한 곳에서 모든 가이드 접근 가능 — guide URL 외우지 않아도 됨.
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { getPendingExternalActions } from "@/lib/autonomous-ops/pending-external-actions";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const metadata: Metadata = {
  title: "사장님 외부 액션 가이드 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ACTION_GUIDES: {
  // PendingExternalAction.category 와 매칭되는 항목 (security/oauth/automation/checkout/infrastructure)
  // 또는 PendingExternalAction 미추적 (adsense/codex) — 항상 "완료 또는 미적용" 표시.
  category: "security" | "oauth" | "automation" | "checkout" | "infrastructure" | "adsense" | "codex";
  emoji: string;
  title: string;
  guidePath: string;
  estimatedMinutes: number;
  description: string;
}[] = [
  {
    category: "security",
    emoji: "🔐",
    title: "보안 회전 (cgc0301! + RENDER_API_KEY)",
    guidePath: "docs/external-actions/security-rotation-2026-05-18.md",
    estimatedMinutes: 10,
    description: "Chrome paste hijack 사고 후속 — 26 도메인 재사용 비밀번호 변경 + Render API key revoke",
  },
  {
    category: "oauth",
    emoji: "🔑",
    title: "Gmail OAuth refresh_token 발급",
    guidePath: "docs/external-actions/adsense-gmail-watch-spec.md",
    estimatedMinutes: 5,
    description: "AdSense 검수 결과 Gmail 이메일 자동 파싱 (D 옵션) 가동",
  },
  {
    category: "automation",
    emoji: "⚙️",
    title: "Naver Extension 설치·secret·dry-run",
    guidePath: "chrome-extension/README.md",
    estimatedMinutes: 10,
    description: "5/13 코드 push 후 가동 안 됨 — 본체 PC Chrome Extension 설치 + secret 입력 + 1건 dry-run",
  },
  {
    category: "adsense",
    emoji: "📊",
    title: "AdSense 검수 결과 사후 액션",
    guidePath: "docs/external-actions/adsense-post-decision-actions.md",
    estimatedMinutes: 5,
    description: "검수 결과 도착 시 (5/23~6/1) 승인·거절·14일 초과 시나리오별 액션",
  },
  {
    category: "codex",
    emoji: "🤖",
    title: "Codex W0 → W1 ramp-up (5/25 시점)",
    guidePath: "docs/superpowers/specs/2026-05-25-codex-w0-to-w1-rampup.md",
    estimatedMinutes: 5,
    description: "Phase 6 W0 1주차 검증 완료 후 W1 활성화 — GitHub PAT + AGENT_W1_ENABLED env",
  },
  {
    category: "infrastructure",
    emoji: "☁️",
    title: "Render Starter plan 업그레이드 ($7/월)",
    guidePath: "memory/project_codex_sidecar_cycle_diagnosis_2026_05_18.md",
    estimatedMinutes: 3,
    description: "Codex sidecar 82분 cycle 사고 — free cold start 해소 + always-on. W1 ramp-up 전 권장.",
  },
];

const REPO_BASE = "https://github.com/keeper0301/government-information/blob/master";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/external-actions");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

export default async function ExternalActionsPage() {
  await requireAdmin();

  const pendingActions = await getPendingExternalActions();
  // 2026-05-19 — category 기반 정확 매칭 (이전 includes() 는 false positive risk).
  // ACTION_GUIDES.category 와 PendingExternalAction.category 가 1:1 매칭.
  const pendingCategories = new Set(pendingActions.map((a) => a.category));

  // 2026-05-19 — 잔여 우선 정렬. 사장님 hub 진입 시 잔여 액션 상단 노출.
  type TrackedCategory =
    | "security"
    | "oauth"
    | "automation"
    | "checkout"
    | "infrastructure";
  const TRACKED_SET = new Set<string>([
    "security",
    "oauth",
    "automation",
    "checkout",
    "infrastructure",
  ]);
  const isPendingGuide = (cat: string): boolean =>
    TRACKED_SET.has(cat) && pendingCategories.has(cat as TrackedCategory);
  const sortedGuides = [...ACTION_GUIDES].sort((a, b) => {
    const aPending = isPendingGuide(a.category);
    const bPending = isPendingGuide(b.category);
    if (aPending && !bPending) return -1;
    if (!aPending && bPending) return 1;
    return 0;
  });

  return (
    <div className="max-w-[980px]">
      <AdminPageHeader
        kicker="ADMIN · 운영 상태"
        title="사장님 외부 액션 가이드"
        description={`5/18 메가 세션 누적 가이드 5건. 잔여 액션 ${pendingActions.length}건 (자동 감지). 각 가이드 5~10분.`}
      />

      <p className="mb-5 text-sm text-grey-700">
        클로드가 진행할 수 없는 외부 액션 가이드입니다. 가이드 link 를 누르면 GitHub repo 의 markdown 문서로 이동합니다.
      </p>

      <ul className="space-y-3">
        {sortedGuides.map((g) => {
          // pendingCategories 는 security/oauth/automation/checkout/infrastructure 만 — adsense/codex 항상 false (미추적)
          const isPending =
            (g.category === "security" ||
              g.category === "oauth" ||
              g.category === "automation" ||
              g.category === "checkout" ||
              g.category === "infrastructure") &&
            pendingCategories.has(g.category);
          return (
            <li
              key={g.guidePath}
              className={`rounded-lg border p-3 ${
                isPending
                  ? "border-amber-200 bg-amber-50/50"
                  : "border-grey-200 bg-white"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-sm font-bold">
                  {g.emoji} {g.title}
                  {isPending && (
                    <span className="ml-2 text-[11px] font-normal text-amber-700">
                      잔여
                    </span>
                  )}
                  {!isPending && (
                    <span className="ml-2 text-[11px] font-normal text-emerald-700">
                      ✓ 완료 또는 미적용
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-grey-600">{g.estimatedMinutes}분</span>
              </div>
              <p className="text-xs text-grey-700 mb-2">{g.description}</p>
              <Link
                href={`${REPO_BASE}/${g.guidePath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 underline"
              >
                가이드 문서 ↗
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-[11px] text-grey-500">
        💡 잔여 표시는 /admin/autonomous PendingExternalActionsCard 와 동기.
        env 등록 / audit row 발생 시 자동 ✓ 완료 전환.
      </p>
    </div>
  );
}
