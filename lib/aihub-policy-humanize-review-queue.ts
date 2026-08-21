import {
  buildPolicyDraftCardPreview,
  type PolicyDraftCard,
  type PolicyDraftCardPreviewSummary,
} from "@/lib/aihub-policy-draft-cards";

export type PolicyHumanizeReviewQueueStatus = "humanize_required" | "review_required";

export type PolicyHumanizeReviewQueueItem = {
  id: string;
  sourceDraftCardId: string;
  status: PolicyHumanizeReviewQueueStatus;
  title: string;
  region: string;
  policyName: string;
  year: 2026;
  sourceUrls: string[];
  humanizeBrief: {
    tone: "natural_korean_policy_explainer";
    preserve: string[];
    avoid: string[];
    requiredDisclosure: "official_source_readback_required_before_publish";
  };
  reviewChecklist: string[];
  nextAction: "run_humanize_korean_then_operator_review";
  publishGate: {
    approvedToPublish: false;
    reason: "draft_queue_item_is_not_publish_approval";
  };
  safety: {
    dbWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
  };
};

export type PolicyHumanizeReviewQueueSummary = {
  generatedFor: "AIHub 4순위 W5 정책 humanize/review queue";
  year: 2026;
  status: "read_only_humanize_review_queue";
  count: number;
  sourceDraftCards: Pick<PolicyDraftCardPreviewSummary, "count" | "countsByStatus" | "sourceReadback">;
  countsByStatus: Record<PolicyHumanizeReviewQueueStatus, number>;
  allowedStatuses: PolicyHumanizeReviewQueueStatus[];
  safety: {
    dbWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
    queueMeans: "humanize_and_operator_review_queue_not_publish_approval";
  };
  items: PolicyHumanizeReviewQueueItem[];
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type BuildHumanizeReviewQueueOptions = {
  fetcher?: FetchLike;
  itemLimit?: number;
  sourceLimit?: number;
  timeoutMs?: number;
};

const ALLOWED_STATUSES: PolicyHumanizeReviewQueueStatus[] = ["humanize_required", "review_required"];

function buildHumanizeBrief(card: PolicyDraftCard): PolicyHumanizeReviewQueueItem["humanizeBrief"] {
  return {
    tone: "natural_korean_policy_explainer",
    preserve: [
      card.title,
      card.region,
      card.policyName,
      "2026",
      ...card.sourceUrls,
    ],
    avoid: [
      "확인되지 않은 신청 기간 단정",
      "지원금 금액·대상 임의 생성",
      "AIHub 데이터를 최신 정책 원문처럼 표현",
      "발행 승인 또는 신청 가능 확정 표현",
    ],
    requiredDisclosure: "official_source_readback_required_before_publish",
  };
}

function buildReviewChecklist(card: PolicyDraftCard): string[] {
  return [
    "공식 원문 URL이 실제 정책/공공서비스 설명으로 연결되는지 확인",
    ...card.factsToVerify,
    "humanize-korean 윤문 뒤에도 숫자·지역·기관명·URL이 보존됐는지 확인",
    "제목/본문이 과장 없이 정보성 문장인지 확인",
    "발행 전 운영자 최종 승인 여부 확인",
  ];
}

function queueItemFromDraftCard(card: PolicyDraftCard): PolicyHumanizeReviewQueueItem {
  return {
    id: `humanize-review-${card.id}`,
    sourceDraftCardId: card.id,
    status: "humanize_required",
    title: card.title,
    region: card.region,
    policyName: card.policyName,
    year: card.year,
    sourceUrls: card.sourceUrls,
    humanizeBrief: buildHumanizeBrief(card),
    reviewChecklist: buildReviewChecklist(card),
    nextAction: "run_humanize_korean_then_operator_review",
    publishGate: {
      approvedToPublish: false,
      reason: "draft_queue_item_is_not_publish_approval",
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

export async function buildPolicyHumanizeReviewQueue(
  options: BuildHumanizeReviewQueueOptions = {},
): Promise<PolicyHumanizeReviewQueueSummary> {
  const draftCards = await buildPolicyDraftCardPreview(options);
  const items = draftCards.cards.map(queueItemFromDraftCard);

  return {
    generatedFor: "AIHub 4순위 W5 정책 humanize/review queue",
    year: 2026,
    status: "read_only_humanize_review_queue",
    count: items.length,
    sourceDraftCards: {
      count: draftCards.count,
      countsByStatus: draftCards.countsByStatus,
      sourceReadback: draftCards.sourceReadback,
    },
    countsByStatus: {
      humanize_required: items.filter((item) => item.status === "humanize_required").length,
      review_required: items.filter((item) => item.status === "review_required").length,
    },
    allowedStatuses: ALLOWED_STATUSES,
    safety: {
      dbWrite: false,
      publish: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
      queueMeans: "humanize_and_operator_review_queue_not_publish_approval",
    },
    items,
  };
}
