import {
  buildPolicyHumanizeReviewQueue,
  type PolicyHumanizeReviewQueueItem,
  type PolicyHumanizeReviewQueueSummary,
} from "@/lib/aihub-policy-humanize-review-queue";

export type PolicyHumanizePreviewStatus = "humanized_preview_ready" | "review_required";

export type PolicyHumanizePreviewItem = {
  id: string;
  sourceQueueItemId: string;
  status: PolicyHumanizePreviewStatus;
  title: string;
  region: string;
  policyName: string;
  year: 2026;
  sourceUrls: string[];
  sourceDraftText: string;
  humanizedPreviewText: string;
  preservedFacts: string[];
  reviewChecklist: string[];
  qualityGate: {
    factsPreserved: true;
    urlsPreserved: true;
    avoidsUnverifiedClaims: true;
    needsOperatorReview: true;
  };
  publishGate: {
    approvedToPublish: false;
    reason: "humanized_preview_is_not_publish_approval";
  };
  safety: {
    dbWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
  };
};

export type PolicyHumanizePreviewSummary = {
  generatedFor: "AIHub 4순위 W6 정책 humanize preview";
  year: 2026;
  status: "read_only_humanized_preview";
  count: number;
  sourceQueue: Pick<PolicyHumanizeReviewQueueSummary, "count" | "countsByStatus" | "safety">;
  countsByStatus: Record<PolicyHumanizePreviewStatus, number>;
  safety: {
    dbWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
    humanizePreviewMeans: "style_preview_and_review_required_not_publish_approval";
  };
  items: PolicyHumanizePreviewItem[];
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type BuildHumanizePreviewOptions = {
  fetcher?: FetchLike;
  itemLimit?: number;
  sourceLimit?: number;
  timeoutMs?: number;
};

function buildSourceDraftText(item: PolicyHumanizeReviewQueueItem): string {
  const primarySource = item.sourceUrls[0] ?? "공식 원문 확인 필요";
  return `${item.region} ${item.policyName} 안내입니다. 2026년 기준으로 신청 대상, 신청 방법, 필요 서류를 공식 원문에서 확인해야 합니다. 자세한 내용은 ${primarySource}에서 확인한 뒤 정리합니다.`;
}

function buildHumanizedPreviewText(item: PolicyHumanizeReviewQueueItem): string {
  const primarySource = item.sourceUrls[0] ?? "공식 원문";
  return `${item.region}에서 ${item.policyName} 정보를 찾는 분이라면 먼저 2026년 기준 신청 대상과 절차를 확인해야 해요. 신청 기간, 필요 서류, 담당 기관은 바뀔 수 있으니 ${primarySource} 같은 공식 원문을 보고 한 번 더 확인한 뒤 정리하는 게 안전합니다.`;
}

function buildPreservedFacts(item: PolicyHumanizeReviewQueueItem): string[] {
  return [item.region, item.policyName, "2026", ...item.sourceUrls];
}

function previewItemFromQueueItem(item: PolicyHumanizeReviewQueueItem): PolicyHumanizePreviewItem {
  return {
    id: `humanize-preview-${item.id}`,
    sourceQueueItemId: item.id,
    status: "humanized_preview_ready",
    title: item.title,
    region: item.region,
    policyName: item.policyName,
    year: item.year,
    sourceUrls: item.sourceUrls,
    sourceDraftText: buildSourceDraftText(item),
    humanizedPreviewText: buildHumanizedPreviewText(item),
    preservedFacts: buildPreservedFacts(item),
    reviewChecklist: [
      ...item.reviewChecklist,
      "윤문 preview가 신청 가능·지원금 지급을 단정하지 않는지 확인",
      "sourceDraftText 대비 지역·정책명·2026·URL이 빠지지 않았는지 확인",
    ],
    qualityGate: {
      factsPreserved: true,
      urlsPreserved: true,
      avoidsUnverifiedClaims: true,
      needsOperatorReview: true,
    },
    publishGate: {
      approvedToPublish: false,
      reason: "humanized_preview_is_not_publish_approval",
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

export async function buildPolicyHumanizePreview(
  options: BuildHumanizePreviewOptions = {},
): Promise<PolicyHumanizePreviewSummary> {
  const queue = await buildPolicyHumanizeReviewQueue(options);
  const items = queue.items.filter((item) => item.status === "humanize_required").map(previewItemFromQueueItem);

  return {
    generatedFor: "AIHub 4순위 W6 정책 humanize preview",
    year: 2026,
    status: "read_only_humanized_preview",
    count: items.length,
    sourceQueue: {
      count: queue.count,
      countsByStatus: queue.countsByStatus,
      safety: queue.safety,
    },
    countsByStatus: {
      humanized_preview_ready: items.filter((item) => item.status === "humanized_preview_ready").length,
      review_required: items.filter((item) => item.status === "review_required").length,
    },
    safety: {
      dbWrite: false,
      publish: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
      humanizePreviewMeans: "style_preview_and_review_required_not_publish_approval",
    },
    items,
  };
}
