import {
  buildPolicyExportRows,
  type PolicyExportRow,
  type PublicReadbackCandidate,
} from "@/lib/aihub-policy-opportunities";

export const POLICY_DRAFT_QUEUE_STATUSES = [
  "needs_fact_readback",
  "ready_for_draft",
  "humanize_required",
  "review_required",
] as const;

export type PolicyDraftQueueStatus = (typeof POLICY_DRAFT_QUEUE_STATUSES)[number];

export type PolicyDraftQueueItem = {
  id: string;
  source: "aihub_policy_monitor_export";
  year: 2026;
  status: PolicyDraftQueueStatus;
  policyName: string;
  region: string;
  title: string;
  aihubUrl: string;
  readbackCandidates: PublicReadbackCandidate[];
  requiredBeforePromotion: string[];
  promotionBlockedReason: string;
  safety: {
    dbWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
  };
};

export type PolicyDraftQueueSummary = {
  generatedFor: "AIHub 4순위 W2 정책 draft candidate queue";
  year: 2026;
  status: "read_only_queue_preview";
  count: number;
  countsByStatus: Record<PolicyDraftQueueStatus, number>;
  allowedStatuses: readonly PolicyDraftQueueStatus[];
  safety: {
    dbWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
    promotionRequiresOfficialReadback: true;
  };
  items: PolicyDraftQueueItem[];
};

function slugPart(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function queueId(row: PolicyExportRow, index: number): string {
  return ["aihub4", row.year, slugPart(row.region), slugPart(row.policyName), String(index + 1).padStart(3, "0")].join("-");
}

function statusFromRow(row: PolicyExportRow): PolicyDraftQueueStatus {
  // W2 is still pre-draft: W1 export rows must not become ready_for_draft
  // until an official source has been read back and reviewed.
  if (row.status === "needs_fact_readback") return "needs_fact_readback";
  return "needs_fact_readback";
}

export function buildPolicyDraftQueueItems(rows: readonly PolicyExportRow[] = buildPolicyExportRows()): PolicyDraftQueueItem[] {
  return rows.map((row, index) => ({
    id: queueId(row, index),
    source: "aihub_policy_monitor_export",
    year: row.year,
    status: statusFromRow(row),
    policyName: row.policyName,
    region: row.region,
    title: row.title,
    aihubUrl: row.aihubUrl,
    readbackCandidates: row.readbackCandidates,
    requiredBeforePromotion: [
      "official_source_readback",
      "current_eligibility_period_documents_check",
      "humanize_korean_prewrite_gate",
      "operator_review_before_publish",
    ],
    promotionBlockedReason: "공식 원문 readback 전에는 ready_for_draft로 승격하지 않음",
    safety: {
      dbWrite: false,
      publish: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
    },
  }));
}

export function summarizePolicyDraftQueue(items: readonly PolicyDraftQueueItem[] = buildPolicyDraftQueueItems()): PolicyDraftQueueSummary {
  const countsByStatus = POLICY_DRAFT_QUEUE_STATUSES.reduce(
    (acc, status) => ({ ...acc, [status]: items.filter((item) => item.status === status).length }),
    {} as Record<PolicyDraftQueueStatus, number>,
  );

  return {
    generatedFor: "AIHub 4순위 W2 정책 draft candidate queue",
    year: 2026,
    status: "read_only_queue_preview",
    count: items.length,
    countsByStatus,
    allowedStatuses: POLICY_DRAFT_QUEUE_STATUSES,
    safety: {
      dbWrite: false,
      publish: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
      promotionRequiresOfficialReadback: true,
    },
    items: [...items],
  };
}
