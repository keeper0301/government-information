import { buildPolicyDraftQueueItems } from "@/lib/aihub-policy-draft-queue";
import {
  buildPolicyOfficialReadbackPreview,
  type PolicyReadbackPreviewSummary,
  type PolicyReadbackQueueItem,
} from "@/lib/aihub-policy-official-readback";

export type PolicyDraftCardStatus = "humanize_required" | "review_required";

export type PolicyDraftCard = {
  id: string;
  sourceQueueItemId: string;
  status: PolicyDraftCardStatus;
  title: string;
  region: string;
  policyName: string;
  year: 2026;
  sourceUrls: string[];
  outline: string[];
  factsToVerify: string[];
  humanizeGate: {
    required: true;
    reason: "public_korean_policy_copy_must_pass_humanize_korean_before_publish";
  };
  reviewGate: {
    required: true;
    reason: "operator_review_required_before_publish_or_external_submit";
  };
  safety: {
    dbWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
  };
};

export type PolicyDraftCardPreviewSummary = {
  generatedFor: "AIHub 4순위 W4 정책 draft card preview";
  year: 2026;
  status: "read_only_draft_card_preview";
  count: number;
  sourceReadback: Pick<PolicyReadbackPreviewSummary, "count" | "countsByStatus" | "readbackLimit" | "readbackSourceLimit">;
  countsByStatus: Record<PolicyDraftCardStatus, number>;
  safety: {
    dbWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
    draftCardMeans: "humanize_and_review_required_preview_not_publish_approval";
  };
  cards: PolicyDraftCard[];
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type BuildDraftCardOptions = {
  fetcher?: FetchLike;
  itemLimit?: number;
  sourceLimit?: number;
  timeoutMs?: number;
};

function successfulSourceUrls(item: PolicyReadbackQueueItem): string[] {
  return item.readbackResults.filter((result) => result.ok).map((result) => result.finalUrl || result.searchUrl);
}

function buildOutline(item: PolicyReadbackQueueItem): string[] {
  return [
    `${item.region} 기준 ${item.title} 핵심 요약`,
    "2026년 신청 대상·이용 대상 확인",
    "공식 원문 기준 신청 방법·필요 서류 정리",
    "지역 주민이 헷갈리기 쉬운 주의사항 FAQ",
    "관련 공공서비스/상담 창구 링크 모음",
  ];
}

function buildFactsToVerify(item: PolicyReadbackQueueItem): string[] {
  return [
    `${item.region}에서 실제 시행 중인지`,
    "2026년 신청 기간·마감일",
    "지원 대상·나이·소득·사업자 조건",
    "필수 서류와 온라인/방문 신청 경로",
    "문의 전화·부서·공식 URL 최신성",
  ];
}

function cardFromReadyItem(item: PolicyReadbackQueueItem): PolicyDraftCard {
  return {
    id: `draft-card-${item.id}`,
    sourceQueueItemId: item.id,
    status: "humanize_required",
    title: item.title,
    region: item.region,
    policyName: item.policyName,
    year: item.year,
    sourceUrls: successfulSourceUrls(item),
    outline: buildOutline(item),
    factsToVerify: buildFactsToVerify(item),
    humanizeGate: {
      required: true,
      reason: "public_korean_policy_copy_must_pass_humanize_korean_before_publish",
    },
    reviewGate: {
      required: true,
      reason: "operator_review_required_before_publish_or_external_submit",
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

export async function buildPolicyDraftCardPreview(options: BuildDraftCardOptions = {}): Promise<PolicyDraftCardPreviewSummary> {
  const readback = await buildPolicyOfficialReadbackPreview(buildPolicyDraftQueueItems(), options);
  const cards = readback.items.filter((item) => item.status === "ready_for_draft").map(cardFromReadyItem);

  return {
    generatedFor: "AIHub 4순위 W4 정책 draft card preview",
    year: 2026,
    status: "read_only_draft_card_preview",
    count: cards.length,
    sourceReadback: {
      count: readback.count,
      countsByStatus: readback.countsByStatus,
      readbackLimit: readback.readbackLimit,
      readbackSourceLimit: readback.readbackSourceLimit,
    },
    countsByStatus: {
      humanize_required: cards.filter((card) => card.status === "humanize_required").length,
      review_required: cards.filter((card) => card.status === "review_required").length,
    },
    safety: {
      dbWrite: false,
      publish: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
      draftCardMeans: "humanize_and_review_required_preview_not_publish_approval",
    },
    cards,
  };
}
