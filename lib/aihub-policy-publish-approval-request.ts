import {
  buildPolicyPublishPackagePreview,
  type PolicyPublishPackagePreviewItem,
  type PolicyPublishPackagePreviewSummary,
} from "@/lib/aihub-policy-publish-package-preview";

export type PolicyPublishApprovalRequestStatus = "approval_request_preview";

export type PolicyPublishApprovalDecisionOption =
  | "approve_for_publish_preview_only"
  | "hold_for_source_readback"
  | "request_revision";

export type PolicyPublishApprovalRequestItem = {
  id: string;
  sourcePublishPackagePreviewId: string;
  status: PolicyPublishApprovalRequestStatus;
  title: string;
  metaDescription: string;
  bodyPreviewDigest: string;
  officialSources: string[];
  approvalQuestion: string;
  decisionOptions: PolicyPublishApprovalDecisionOption[];
  requiredAcknowledgements: string[];
  prePublishApprovalChecklist: string[];
  publishGate: {
    approvedToPublish: false;
    reason: "approval_request_preview_does_not_record_or_execute_publish_approval";
  };
  safety: {
    dbWrite: false;
    publish: false;
    approvalWrite: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
  };
};

export type PolicyPublishApprovalRequestSummary = {
  generatedFor: "AIHub 4순위 W9 정책 publish approval request preview";
  year: 2026;
  status: "read_only_publish_approval_request_preview";
  count: number;
  sourcePublishPackagePreview: Pick<PolicyPublishPackagePreviewSummary, "count" | "sourceStatus" | "safety">;
  sourceStatus: "publish_package_preview";
  decisionOptions: PolicyPublishApprovalDecisionOption[];
  safety: {
    dbWrite: false;
    publish: false;
    approvalWrite: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
    approvalRequestPreviewMeans: "operator_decision_prompt_only_not_saved_not_published";
  };
  items: PolicyPublishApprovalRequestItem[];
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type BuildPublishApprovalRequestOptions = {
  fetcher?: FetchLike;
  itemLimit?: number;
  sourceLimit?: number;
  timeoutMs?: number;
};

const DECISION_OPTIONS: PolicyPublishApprovalDecisionOption[] = [
  "approve_for_publish_preview_only",
  "hold_for_source_readback",
  "request_revision",
];

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildBodyPreviewDigest(item: PolicyPublishPackagePreviewItem): string {
  return compactWhitespace(item.bodyPreview).slice(0, 240);
}

function buildApprovalQuestion(item: PolicyPublishPackagePreviewItem): string {
  return `이 패키지를 실제 발행 후보로 넘기려면 운영자가 공식 출처와 체크리스트를 확인한 뒤 별도 승인해야 합니다. 제목: ${item.title}`;
}

function buildRequiredAcknowledgements(item: PolicyPublishPackagePreviewItem): string[] {
  return [
    "이 화면은 승인 요청 preview이며 승인 기록을 저장하지 않음",
    "승인 버튼이나 실제 발행 동작을 실행하지 않음",
    "공식 출처를 직접 열어 신청 기간·대상·서류·담당 기관을 확인해야 함",
    "humanize-korean/prepublish gate 후에도 사실·숫자·URL 보존을 다시 확인해야 함",
    "최종 live publish, GSC, IndexNow, Naver submit은 별도 명시 승인 필요",
    `공식 출처 ${item.officialSources.length}개가 첨부되어 있음을 확인`,
  ];
}

function approvalRequestItemFromPackage(item: PolicyPublishPackagePreviewItem): PolicyPublishApprovalRequestItem {
  return {
    id: `publish-approval-request-${item.id}`,
    sourcePublishPackagePreviewId: item.id,
    status: "approval_request_preview",
    title: item.title,
    metaDescription: item.metaDescription,
    bodyPreviewDigest: buildBodyPreviewDigest(item),
    officialSources: item.officialSources,
    approvalQuestion: buildApprovalQuestion(item),
    decisionOptions: DECISION_OPTIONS,
    requiredAcknowledgements: buildRequiredAcknowledgements(item),
    prePublishApprovalChecklist: item.prePublishApprovalChecklist,
    publishGate: {
      approvedToPublish: false,
      reason: "approval_request_preview_does_not_record_or_execute_publish_approval",
    },
    safety: {
      dbWrite: false,
      publish: false,
      approvalWrite: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
    },
  };
}

export async function buildPolicyPublishApprovalRequestPreview(
  options: BuildPublishApprovalRequestOptions = {},
): Promise<PolicyPublishApprovalRequestSummary> {
  const publishPackagePreview = await buildPolicyPublishPackagePreview(options);
  const items = publishPackagePreview.items.map(approvalRequestItemFromPackage);

  return {
    generatedFor: "AIHub 4순위 W9 정책 publish approval request preview",
    year: 2026,
    status: "read_only_publish_approval_request_preview",
    count: items.length,
    sourcePublishPackagePreview: {
      count: publishPackagePreview.count,
      sourceStatus: publishPackagePreview.sourceStatus,
      safety: publishPackagePreview.safety,
    },
    sourceStatus: "publish_package_preview",
    decisionOptions: DECISION_OPTIONS,
    safety: {
      dbWrite: false,
      publish: false,
      approvalWrite: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
      approvalRequestPreviewMeans: "operator_decision_prompt_only_not_saved_not_published",
    },
    items,
  };
}
