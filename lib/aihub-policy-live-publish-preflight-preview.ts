import {
  buildPolicyPublishApprovalDecisionPreview,
  type PolicyPublishApprovalDecisionPreviewItem,
  type PolicyPublishApprovalDecisionPreviewSummary,
} from "@/lib/aihub-policy-publish-approval-decision-preview";

export type PolicyLivePublishPreflightPreviewStatus = "live_publish_preflight_preview_blocked";

export type PolicyLivePublishPreflightPreviewItem = {
  id: string;
  sourceDecisionPreviewId: string;
  status: PolicyLivePublishPreflightPreviewStatus;
  title: string;
  metaDescription: string;
  officialSources: string[];
  preflightSummary: string;
  requiredBeforeLivePublish: string[];
  blockingReasons: string[];
  liveActionPlanPreview: {
    destination: "policy_public_article";
    publishMode: "manual_or_explicitly_approved_live_action_only";
    requiresFreshOperatorApproval: true;
    requiresOfficialSourceReadback: true;
    requiresHumanizeGateReadback: true;
  };
  liveGate: {
    readyForLivePublish: false;
    reason: "preflight_preview_blocks_live_publish_until_fresh_explicit_approval_and_readback";
  };
  safety: {
    dbWrite: false;
    approvalWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
  };
};

export type PolicyLivePublishPreflightPreviewSummary = {
  generatedFor: "AIHub 4순위 W11 정책 live publish preflight preview";
  year: 2026;
  status: "read_only_live_publish_preflight_preview";
  count: number;
  sourceDecisionPreview: Pick<PolicyPublishApprovalDecisionPreviewSummary, "count" | "selectedDecision" | "sourceStatus" | "safety">;
  sourceStatus: "approval_decision_preview_approve";
  safety: {
    dbWrite: false;
    approvalWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
    preflightPreviewMeans: "live_publish_blocker_check_only_not_publishable_state";
  };
  items: PolicyLivePublishPreflightPreviewItem[];
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type BuildLivePublishPreflightPreviewOptions = {
  fetcher?: FetchLike;
  itemLimit?: number;
  sourceLimit?: number;
  timeoutMs?: number;
};

function buildPreflightSummary(item: PolicyPublishApprovalDecisionPreviewItem): string {
  return `${item.title} 항목을 live publish 직전 단계로 보낼 수 있는지 미리 점검합니다. 현재는 read-only preflight preview라서 발행 가능 상태가 아니며, fresh approval과 원문 readback이 필요합니다.`;
}

function buildRequiredBeforeLivePublish(item: PolicyPublishApprovalDecisionPreviewItem): string[] {
  return [
    "운영자의 fresh explicit live publish 승인 문구 확보",
    "공식 출처 URL 직접 열람 및 원문 살아 있음 확인",
    "신청 대상·기간·서류·담당 기관 최신성 readback 완료",
    "humanize-korean/prepublish gate 실행 후 사실·숫자·URL 보존 확인",
    "본문·메타 설명에 미확인 혜택·금액·신청 가능 단정이 없는지 확인",
    "발행 대상 채널, slug, category, tags를 별도 승인 범위 안에서 확정",
    "GSC, IndexNow, Naver submit은 live 발행과 별도 승인으로 분리",
    `확인 대상 공식 출처: ${item.officialSources.join(", ")}`,
  ];
}

function buildBlockingReasons(): string[] {
  return [
    "fresh explicit live publish approval이 없음",
    "official source readback 완료 기록이 없음",
    "humanize-korean/prepublish gate readback 결과가 없음",
    "live destination/slug/category/tags가 확정되지 않음",
    "approval decision preview는 저장된 승인 기록이 아님",
  ];
}

function preflightItemFromDecisionPreview(
  item: PolicyPublishApprovalDecisionPreviewItem,
): PolicyLivePublishPreflightPreviewItem {
  return {
    id: `live-publish-preflight-preview-${item.id}`,
    sourceDecisionPreviewId: item.id,
    status: "live_publish_preflight_preview_blocked",
    title: item.title,
    metaDescription: item.metaDescription,
    officialSources: item.officialSources,
    preflightSummary: buildPreflightSummary(item),
    requiredBeforeLivePublish: buildRequiredBeforeLivePublish(item),
    blockingReasons: buildBlockingReasons(),
    liveActionPlanPreview: {
      destination: "policy_public_article",
      publishMode: "manual_or_explicitly_approved_live_action_only",
      requiresFreshOperatorApproval: true,
      requiresOfficialSourceReadback: true,
      requiresHumanizeGateReadback: true,
    },
    liveGate: {
      readyForLivePublish: false,
      reason: "preflight_preview_blocks_live_publish_until_fresh_explicit_approval_and_readback",
    },
    safety: {
      dbWrite: false,
      approvalWrite: false,
      publish: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
    },
  };
}

export async function buildPolicyLivePublishPreflightPreview(
  options: BuildLivePublishPreflightPreviewOptions = {},
): Promise<PolicyLivePublishPreflightPreviewSummary> {
  const decisionPreview = await buildPolicyPublishApprovalDecisionPreview({
    ...options,
    selectedDecision: "approve_for_publish_preview_only",
  });
  const items = decisionPreview.items
    .filter((item) => item.status === "approval_decision_preview_approve")
    .map(preflightItemFromDecisionPreview);

  return {
    generatedFor: "AIHub 4순위 W11 정책 live publish preflight preview",
    year: 2026,
    status: "read_only_live_publish_preflight_preview",
    count: items.length,
    sourceDecisionPreview: {
      count: decisionPreview.count,
      selectedDecision: decisionPreview.selectedDecision,
      sourceStatus: decisionPreview.sourceStatus,
      safety: decisionPreview.safety,
    },
    sourceStatus: "approval_decision_preview_approve",
    safety: {
      dbWrite: false,
      approvalWrite: false,
      publish: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
      preflightPreviewMeans: "live_publish_blocker_check_only_not_publishable_state",
    },
    items,
  };
}
