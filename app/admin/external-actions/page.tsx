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
import {
  getPendingExternalActions,
  CATEGORY_META,
  type PendingExternalActionCategory,
} from "@/lib/autonomous-ops/pending-external-actions";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const metadata: Metadata = {
  title: "사장님 외부 액션 가이드 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// 2026-05-26 — emoji 는 CATEGORY_META 단일 source 참조. 새 카테고리 추가 시
// lib/autonomous-ops/pending-external-actions.ts 한 곳만 수정 → 두 페이지 자동 동기.
const ACTION_GUIDES: {
  // PendingExternalAction.category 와 매칭되는 항목.
  category: PendingExternalActionCategory;
  title: string;
  guidePath: string;
  estimatedMinutes: number;
  description: string;
  pendingMatch: (action: Awaited<ReturnType<typeof getPendingExternalActions>>[number]) => boolean;
}[] = [
  {
    category: "security",
    title: "보안 회전 (cgc0301! + RENDER_API_KEY)",
    guidePath: "docs/external-actions/security-rotation-2026-05-18.md",
    estimatedMinutes: 10,
    description: "Chrome paste hijack 사고 후속 — 26 도메인 재사용 비밀번호 변경 + Render API key revoke",
    pendingMatch: (a) => a.guideUrl?.includes("security-rotation-2026-05-18.md") ?? false,
  },
  {
    category: "oauth",
    title: "Gmail OAuth refresh_token 발급",
    guidePath: "docs/external-actions/adsense-gmail-watch-spec.md",
    estimatedMinutes: 5,
    description: "AdSense 검수 결과 Gmail 이메일 자동 파싱 (D 옵션) 가동",
    pendingMatch: (a) => a.guideUrl?.includes("adsense-gmail-watch-spec.md") ?? false,
  },
  {
    category: "oauth",
    title: "SNS 발행 credential 재발급",
    guidePath: "docs/external-actions/sns-credential-renewal.md",
    estimatedMinutes: 10,
    description: "X/Twitter·Facebook·Threads env 누락/invalid token을 분리 점검하고 Vercel Production env를 갱신",
    pendingMatch: (a) => a.guideUrl?.includes("sns-credential-renewal.md") ?? false,
  },
  {
    category: "automation",
    title: "Naver Extension 설치·secret·dry-run",
    guidePath: "chrome-extension/README.md",
    estimatedMinutes: 10,
    description: "5/13 코드 push 후 가동 안 됨 — 본체 PC Chrome Extension 설치 + secret 입력 + 1건 dry-run",
    pendingMatch: (a) => a.label.includes("Naver Extension"),
  },
  {
    category: "adsense",
    title: "AdSense 검수 결과 사후 액션",
    guidePath: "docs/external-actions/adsense-post-decision-actions.md",
    estimatedMinutes: 5,
    description: "검수 결과 도착 시 (5/23~6/1) 승인·거절·14일 초과 시나리오별 액션",
    pendingMatch: (a) => a.guideUrl?.includes("adsense-post-decision-actions.md") ?? false,
  },
  {
    category: "codex",
    title: "Codex W0 → W1 ramp-up (5/25 시점)",
    guidePath: "docs/superpowers/specs/2026-05-25-codex-w0-to-w1-rampup.md",
    estimatedMinutes: 5,
    description: "Phase 6 W0 1주차 검증 완료 후 W1 활성화 — GitHub PAT + AGENT_W1_ENABLED env",
    pendingMatch: (a) => a.guideUrl?.includes("2026-05-25-codex-w0-to-w1-rampup.md") ?? false,
  },
  {
    category: "infrastructure",
    title: "Render Starter plan 업그레이드 ($7/월)",
    guidePath: "docs/external-actions/render-plan-upgrade.md",
    estimatedMinutes: 3,
    description: "Codex sidecar 82분 cycle 사고 — free cold start 해소 + always-on. W1 ramp-up 전 권장.",
    pendingMatch: (a) => a.label.includes("Render Starter"),
  },
  {
    category: "checkout",
    title: "토스페이먼츠 빌링 카드사 심사 통과 신고",
    guidePath: "docs/external-actions/toss-billing-review.md",
    estimatedMinutes: 2,
    description: "tools/generate-toss-ppt.mjs 으로 PPT 검수 자료 생성 (5/26). 카드사 심사 통과 후 1 click 신고",
    pendingMatch: (a) => a.guideUrl?.includes("toss-billing-review.md") ?? false,
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
  // 2026-07-19 — category 단위 매칭은 같은 카테고리 내 별도 액션(SNS OAuth, PC runner 등)이
  // Gmail/Naver guide 를 pending 으로 오염시키는 false positive 를 만든다.
  // 각 guide 가 자기 guideUrl/label 만 보도록 세분화한다.
  const guidePending = new Map(
    ACTION_GUIDES.map((g) => [g.guidePath, pendingActions.some(g.pendingMatch)]),
  );
  const guidePendingCount = [...guidePending.values()].filter(Boolean).length;

  // 잔여 우선 정렬. 사장님 hub 진입 시 잔여 guide 를 상단 노출.
  const sortedGuides = [...ACTION_GUIDES].sort((a, b) => {
    const aPending = guidePending.get(a.guidePath) ?? false;
    const bPending = guidePending.get(b.guidePath) ?? false;
    if (aPending && !bPending) return -1;
    if (!aPending && bPending) return 1;
    return 0;
  });

  return (
    <div className="max-w-[980px]">
      <AdminPageHeader
        kicker="ADMIN · 운영 상태"
        title="사장님 외부 액션 가이드"
        description={`외부 액션 가이드 ${ACTION_GUIDES.length}건. 잔여 액션 ${guidePendingCount}건 (자동 감지). 각 가이드 2~10분.`}
      />

      <p className="mb-5 text-sm text-grey-700">
        클로드가 진행할 수 없는 외부 액션 가이드입니다. 가이드 link 를 누르면 GitHub repo 의 markdown 문서로 이동합니다.
      </p>

      <ul className="space-y-3">
        {sortedGuides.map((g) => {
          // 2026-07-19 — guide 별 match. 같은 category 의 다른 잔여가 이 guide 상태를 오염시키지 않음.
          const isPending = guidePending.get(g.guidePath) ?? false;
          return (
            <li
              key={g.guidePath}
              className={`rounded-lg border p-3 ${
                isPending
                  ? "border-amber-200 bg-amber-50/50"
                  : "border-grey-200 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 mb-1">
                <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm font-bold">
                  <span>
                    {CATEGORY_META[g.category].emoji} {g.title}
                  </span>
                  <span className="rounded bg-grey-100 px-1.5 py-0.5 text-[10px] font-normal text-grey-700">
                    {CATEGORY_META[g.category].label}
                  </span>
                  {isPending && (
                    <span className="text-[11px] font-normal text-amber-700">
                      잔여
                    </span>
                  )}
                  {!isPending && (
                    <span className="text-[11px] font-normal text-emerald-700">
                      ✓ 완료 또는 미적용
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[11px] text-grey-600">{g.estimatedMinutes}분</span>
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
