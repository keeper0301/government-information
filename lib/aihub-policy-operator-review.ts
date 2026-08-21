import {
  buildPolicyHumanizePreview,
  type PolicyHumanizePreviewItem,
  type PolicyHumanizePreviewSummary,
} from "@/lib/aihub-policy-humanize-preview";

export type PolicyOperatorReviewStatus = "review_passed_preview" | "review_hold" | "revision_required";

export type PolicyOperatorReviewItem = {
  id: string;
  sourceHumanizePreviewId: string;
  status: PolicyOperatorReviewStatus;
  title: string;
  region: string;
  policyName: string;
  year: 2026;
  sourceUrls: string[];
  humanizedPreviewText: string;
  reviewDecision: {
    canMoveToReviewPassedPreview: boolean;
    reason: string;
  };
  passChecklist: string[];
  holdChecklist: string[];
  revisionChecklist: string[];
  publishGate: {
    approvedToPublish: false;
    reason: "operator_review_preview_is_not_publish_approval";
  };
  safety: {
    dbWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
  };
};

export type PolicyOperatorReviewSummary = {
  generatedFor: "AIHub 4순위 W7 정책 operator review preview";
  year: 2026;
  status: "read_only_operator_review_preview";
  count: number;
  sourceHumanizePreview: Pick<PolicyHumanizePreviewSummary, "count" | "countsByStatus" | "safety">;
  countsByStatus: Record<PolicyOperatorReviewStatus, number>;
  allowedStatuses: PolicyOperatorReviewStatus[];
  safety: {
    dbWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
    operatorReviewMeans: "pass_hold_revision_preview_not_publish_approval";
  };
  items: PolicyOperatorReviewItem[];
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type BuildOperatorReviewOptions = {
  fetcher?: FetchLike;
  itemLimit?: number;
  sourceLimit?: number;
  timeoutMs?: number;
};

const ALLOWED_STATUSES: PolicyOperatorReviewStatus[] = ["review_passed_preview", "review_hold", "revision_required"];

function hasRequiredReviewSignals(item: PolicyHumanizePreviewItem): boolean {
  return item.qualityGate.factsPreserved && item.qualityGate.urlsPreserved && item.qualityGate.avoidsUnverifiedClaims && item.qualityGate.needsOperatorReview && item.sourceUrls.length > 0;
}

function statusForPreview(item: PolicyHumanizePreviewItem): PolicyOperatorReviewStatus {
  if (!item.sourceUrls.length) return "review_hold";
  if (!hasRequiredReviewSignals(item)) return "revision_required";
  return "review_passed_preview";
}

function buildPassChecklist(): string[] {
  return [
    "공식 URL이 1개 이상 붙어 있음",
    "지역·정책명·2026 표기가 preservedFacts에 남아 있음",
    "humanizedPreviewText가 신청 가능/지원 확정을 단정하지 않음",
    "qualityGate.factsPreserved=true",
    "qualityGate.urlsPreserved=true",
    "qualityGate.avoidsUnverifiedClaims=true",
  ];
}

function buildHoldChecklist(item: PolicyHumanizePreviewItem): string[] {
  return [
    "공식 URL 본문이 실제 정책 설명인지 운영자가 재확인 필요",
    "신청 기간·대상·필수 서류가 원문에 없으면 review_hold 유지",
    ...item.reviewChecklist.slice(0, 4),
  ];
}

function buildRevisionChecklist(): string[] {
  return [
    "지원금 금액·신청 가능 여부를 임의로 추가하지 말 것",
    "지역명·정책명·기관명·URL 누락 시 수정 필요",
    "홍보성/과장 표현이 있으면 정보성 문장으로 재작성",
    "운영자 최종 승인 전 publish=false 유지",
  ];
}

function reviewItemFromHumanizePreview(item: PolicyHumanizePreviewItem): PolicyOperatorReviewItem {
  const status = statusForPreview(item);
  return {
    id: `operator-review-${item.id}`,
    sourceHumanizePreviewId: item.id,
    status,
    title: item.title,
    region: item.region,
    policyName: item.policyName,
    year: item.year,
    sourceUrls: item.sourceUrls,
    humanizedPreviewText: item.humanizedPreviewText,
    reviewDecision: {
      canMoveToReviewPassedPreview: status === "review_passed_preview",
      reason:
        status === "review_passed_preview"
          ? "bounded_preview_quality_gates_passed_operator_must_still_confirm"
          : status === "review_hold"
            ? "official_source_or_policy_fact_needs_manual_confirmation"
            : "humanized_preview_needs_revision_before_review_pass",
    },
    passChecklist: buildPassChecklist(),
    holdChecklist: buildHoldChecklist(item),
    revisionChecklist: buildRevisionChecklist(),
    publishGate: {
      approvedToPublish: false,
      reason: "operator_review_preview_is_not_publish_approval",
    },
    safety: {
      dbWrite: false,
      publish: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
    },
  };
}

export async function buildPolicyOperatorReviewPreview(
  options: BuildOperatorReviewOptions = {},
): Promise<PolicyOperatorReviewSummary> {
  const humanizePreview = await buildPolicyHumanizePreview(options);
  const items = humanizePreview.items.map(reviewItemFromHumanizePreview);

  return {
    generatedFor: "AIHub 4순위 W7 정책 operator review preview",
    year: 2026,
    status: "read_only_operator_review_preview",
    count: items.length,
    sourceHumanizePreview: {
      count: humanizePreview.count,
      countsByStatus: humanizePreview.countsByStatus,
      safety: humanizePreview.safety,
    },
    countsByStatus: {
      review_passed_preview: items.filter((item) => item.status === "review_passed_preview").length,
      review_hold: items.filter((item) => item.status === "review_hold").length,
      revision_required: items.filter((item) => item.status === "revision_required").length,
    },
    allowedStatuses: ALLOWED_STATUSES,
    safety: {
      dbWrite: false,
      publish: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
      operatorReviewMeans: "pass_hold_revision_preview_not_publish_approval",
    },
    items,
  };
}
