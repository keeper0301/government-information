import {
  buildPolicyPublishApprovalRequestPreview,
  type PolicyPublishApprovalDecisionOption,
  type PolicyPublishApprovalRequestItem,
  type PolicyPublishApprovalRequestSummary,
} from "@/lib/aihub-policy-publish-approval-request";

export type { PolicyPublishApprovalDecisionOption } from "@/lib/aihub-policy-publish-approval-request";

export type PolicyPublishApprovalDecisionPreviewStatus =
  | "approval_decision_preview_approve"
  | "approval_decision_preview_hold"
  | "approval_decision_preview_revision";

export type PolicyPublishApprovalDecisionPreviewItem = {
  id: string;
  sourceApprovalRequestId: string;
  status: PolicyPublishApprovalDecisionPreviewStatus;
  selectedDecision: PolicyPublishApprovalDecisionOption;
  title: string;
  metaDescription: string;
  officialSources: string[];
  decisionSummary: string;
  nextStepPreview: string;
  requiredReadbackBeforeLive: string[];
  approvalReceiptPreview: {
    decisionRecorded: false;
    canProceedToLivePublish: false;
    requiresSeparateLiveApproval: true;
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

export type PolicyPublishApprovalDecisionPreviewSummary = {
  generatedFor: "AIHub 4순위 W10 정책 publish approval decision preview";
  year: 2026;
  status: "read_only_publish_approval_decision_preview";
  count: number;
  selectedDecision: PolicyPublishApprovalDecisionOption;
  sourceApprovalRequestPreview: Pick<PolicyPublishApprovalRequestSummary, "count" | "sourceStatus" | "safety">;
  sourceStatus: "approval_request_preview";
  safety: {
    dbWrite: false;
    approvalWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
    decisionPreviewMeans: "selected_decision_receipt_preview_only_not_saved_not_published";
  };
  items: PolicyPublishApprovalDecisionPreviewItem[];
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type BuildPublishApprovalDecisionPreviewOptions = {
  fetcher?: FetchLike;
  itemLimit?: number;
  sourceLimit?: number;
  timeoutMs?: number;
  selectedDecision?: PolicyPublishApprovalDecisionOption;
};

const DEFAULT_DECISION: PolicyPublishApprovalDecisionOption = "hold_for_source_readback";

function statusFromDecision(decision: PolicyPublishApprovalDecisionOption): PolicyPublishApprovalDecisionPreviewStatus {
  if (decision === "approve_for_publish_preview_only") return "approval_decision_preview_approve";
  if (decision === "request_revision") return "approval_decision_preview_revision";
  return "approval_decision_preview_hold";
}

function summaryFromDecision(item: PolicyPublishApprovalRequestItem, decision: PolicyPublishApprovalDecisionOption): string {
  if (decision === "approve_for_publish_preview_only") {
    return `운영자가 ${item.title} 패키지를 다음 검토 단계 후보로 승인하는 상황을 미리 봅니다. 이 preview는 승인 기록도, 실제 발행도 아닙니다.`;
  }
  if (decision === "request_revision") {
    return `운영자가 ${item.title} 패키지의 본문·메타·출처 확인 보강을 요청하는 상황을 미리 봅니다. 수정 요청은 저장되지 않습니다.`;
  }
  return `운영자가 ${item.title} 패키지를 공식 출처 readback 전까지 보류하는 상황을 미리 봅니다. 보류 결정은 저장되지 않습니다.`;
}

function nextStepFromDecision(decision: PolicyPublishApprovalDecisionOption): string {
  if (decision === "approve_for_publish_preview_only") {
    return "다음 단계 후보로만 이동 가능하며, live publish는 별도 명시 승인과 readback gate가 필요합니다.";
  }
  if (decision === "request_revision") {
    return "본문 preview, 메타 설명, 공식 출처 확인 문구를 수정한 뒤 W8/W9 preview를 다시 생성합니다.";
  }
  return "공식 출처를 직접 열어 대상·기간·서류·담당 기관 readback을 마친 뒤 다시 승인 요청 preview를 확인합니다.";
}

function readbackChecklist(item: PolicyPublishApprovalRequestItem): string[] {
  return [
    "공식 출처 URL이 열리고 원문/검색 결과가 살아 있는지 확인",
    "신청 대상·신청 기간·필요 서류·담당 기관 최신성 확인",
    "본문 digest와 메타 설명이 원문에 없는 혜택·금액을 단정하지 않는지 확인",
    "humanize-korean/prepublish gate 이후 사실·숫자·URL 보존 확인",
    "live publish, GSC, IndexNow, Naver submit은 별도 명시 승인 전까지 금지",
    `확인 대상 공식 출처: ${item.officialSources.join(", ")}`,
  ];
}

function decisionItemFromApprovalRequest(
  item: PolicyPublishApprovalRequestItem,
  selectedDecision: PolicyPublishApprovalDecisionOption,
): PolicyPublishApprovalDecisionPreviewItem {
  return {
    id: `publish-approval-decision-preview-${item.id}`,
    sourceApprovalRequestId: item.id,
    status: statusFromDecision(selectedDecision),
    selectedDecision,
    title: item.title,
    metaDescription: item.metaDescription,
    officialSources: item.officialSources,
    decisionSummary: summaryFromDecision(item, selectedDecision),
    nextStepPreview: nextStepFromDecision(selectedDecision),
    requiredReadbackBeforeLive: readbackChecklist(item),
    approvalReceiptPreview: {
      decisionRecorded: false,
      canProceedToLivePublish: false,
      requiresSeparateLiveApproval: true,
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

export async function buildPolicyPublishApprovalDecisionPreview(
  options: BuildPublishApprovalDecisionPreviewOptions = {},
): Promise<PolicyPublishApprovalDecisionPreviewSummary> {
  const approvalRequestPreview = await buildPolicyPublishApprovalRequestPreview(options);
  const selectedDecision = options.selectedDecision ?? DEFAULT_DECISION;
  const items = approvalRequestPreview.items.map((item) => decisionItemFromApprovalRequest(item, selectedDecision));

  return {
    generatedFor: "AIHub 4순위 W10 정책 publish approval decision preview",
    year: 2026,
    status: "read_only_publish_approval_decision_preview",
    count: items.length,
    selectedDecision,
    sourceApprovalRequestPreview: {
      count: approvalRequestPreview.count,
      sourceStatus: approvalRequestPreview.sourceStatus,
      safety: approvalRequestPreview.safety,
    },
    sourceStatus: "approval_request_preview",
    safety: {
      dbWrite: false,
      approvalWrite: false,
      publish: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
      decisionPreviewMeans: "selected_decision_receipt_preview_only_not_saved_not_published",
    },
    items,
  };
}
