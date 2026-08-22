import {
  buildPolicyReadbackSchedulerPreview,
  type PolicyReadbackScheduleCard,
  type PolicyReadbackScheduleSlot,
  type PolicyReadbackSchedulerPreviewSummary,
} from "@/lib/aihub-policy-readback-scheduler-preview";

export type PolicyReadbackExecutionPreflightStatus = "readback_execution_preflight_preview_blocked";

export type PolicyReadbackExecutionPreflightItem = {
  id: string;
  sourceScheduleCardId: string;
  status: PolicyReadbackExecutionPreflightStatus;
  slot: PolicyReadbackScheduleSlot;
  title: string;
  scheduledForPreview: string;
  expectedPublishedUrlPreview: string;
  executionMode: "manual_readback_preview_only";
  requiredApprovals: string[];
  requiredInputs: string[];
  preflightChecks: string[];
  blockingReasons: string[];
  canRunNow: false;
  canCreateCron: false;
  canFetchExternal: false;
  canSubmitSearch: false;
  safety: {
    cronCreate: false;
    dbWrite: false;
    publish: false;
    externalFetch: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
    executionPreviewMeans: "operator_checklist_only_not_scheduler_or_network_run";
  };
};

export type PolicyReadbackExecutionPreflightPreviewSummary = {
  generatedFor: "AIHub 4순위 W14 정책 readback execution preflight preview";
  year: 2026;
  status: "read_only_readback_execution_preflight_preview";
  count: number;
  requestedSlot: PolicyReadbackScheduleSlot | "all";
  sourceSchedulerPreview: Pick<PolicyReadbackSchedulerPreviewSummary, "count" | "sourceStatus" | "safety">;
  sourceStatus: "readback_schedule_preview_pending_live_publish";
  safety: {
    cronCreate: false;
    dbWrite: false;
    publish: false;
    externalFetch: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
    preflightPreviewMeans: "readback_run_gate_only_not_live_execution";
  };
  items: PolicyReadbackExecutionPreflightItem[];
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type BuildReadbackExecutionPreflightPreviewOptions = {
  fetcher?: FetchLike;
  itemLimit?: number;
  sourceLimit?: number;
  timeoutMs?: number;
  baseUrl?: string;
  generatedAt?: Date;
  slot?: PolicyReadbackScheduleSlot | "all";
};

const VALID_SLOTS: Array<PolicyReadbackScheduleSlot | "all"> = ["all", "immediate", "after_24h", "after_72h"];

function normalizeSlot(slot: BuildReadbackExecutionPreflightPreviewOptions["slot"]): PolicyReadbackScheduleSlot | "all" {
  return slot && VALID_SLOTS.includes(slot) ? slot : "all";
}

function approvalsForSlot(slot: PolicyReadbackScheduleSlot): string[] {
  const common = [
    "관철의 live readback 실행 승인",
    "실제 공개 URL 확인 승인",
    "외부 HTTP readback 허용 범위 승인",
  ];

  if (slot === "immediate") {
    return [...common, "GSC/IndexNow/Naver 제출은 별도 승인으로 분리"];
  }

  return [...common, "GSC 성과 readback 범위와 기준 시각 승인"];
}

function requiredInputsForCard(card: PolicyReadbackScheduleCard): string[] {
  return [
    "실제 발행 완료 receipt",
    `실제 공개 URL: ${card.expectedPublishedUrlPreview} 확인 필요`,
    "발행 시각 기준 scheduledFor 재계산",
    "readback 대상 공식 출처 URL 최신성 확인",
  ];
}

function preflightChecksForCard(card: PolicyReadbackScheduleCard): string[] {
  return [
    "published URL이 2xx/readable인지 확인하기 전까지 실행 금지",
    "title/meta/body/source link 확인 항목 분리",
    "검색 제출은 request accepted readback만 기록하고 색인 보장 표현 금지",
    ...card.targetChecks,
  ];
}

function blockingReasonsForCard(card: PolicyReadbackScheduleCard): string[] {
  return [
    ...card.blockers,
    "W14는 실행 전 preflight preview라 canRunNow=false 유지",
    "실제 cron 생성/외부 fetch/검색 제출은 별도 승인 전까지 차단",
  ];
}

function itemFromScheduleCard(card: PolicyReadbackScheduleCard): PolicyReadbackExecutionPreflightItem {
  return {
    id: `readback-execution-preflight-${card.slot}-${card.sourceLiveReadbackPreviewId}`,
    sourceScheduleCardId: card.id,
    status: "readback_execution_preflight_preview_blocked",
    slot: card.slot,
    title: card.title,
    scheduledForPreview: card.scheduledForPreview,
    expectedPublishedUrlPreview: card.expectedPublishedUrlPreview,
    executionMode: "manual_readback_preview_only",
    requiredApprovals: approvalsForSlot(card.slot),
    requiredInputs: requiredInputsForCard(card),
    preflightChecks: preflightChecksForCard(card),
    blockingReasons: blockingReasonsForCard(card),
    canRunNow: false,
    canCreateCron: false,
    canFetchExternal: false,
    canSubmitSearch: false,
    safety: {
      cronCreate: false,
      dbWrite: false,
      publish: false,
      externalFetch: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
      executionPreviewMeans: "operator_checklist_only_not_scheduler_or_network_run",
    },
  };
}

export async function buildPolicyReadbackExecutionPreflightPreview(
  options: BuildReadbackExecutionPreflightPreviewOptions = {},
): Promise<PolicyReadbackExecutionPreflightPreviewSummary> {
  const requestedSlot = normalizeSlot(options.slot);
  const schedulerPreview = await buildPolicyReadbackSchedulerPreview(options);
  const selectedCards =
    requestedSlot === "all" ? schedulerPreview.cards : schedulerPreview.cards.filter((card) => card.slot === requestedSlot);
  const items = selectedCards.map(itemFromScheduleCard);

  return {
    generatedFor: "AIHub 4순위 W14 정책 readback execution preflight preview",
    year: 2026,
    status: "read_only_readback_execution_preflight_preview",
    count: items.length,
    requestedSlot,
    sourceSchedulerPreview: {
      count: schedulerPreview.count,
      sourceStatus: schedulerPreview.sourceStatus,
      safety: schedulerPreview.safety,
    },
    sourceStatus: "readback_schedule_preview_pending_live_publish",
    safety: {
      cronCreate: false,
      dbWrite: false,
      publish: false,
      externalFetch: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
      preflightPreviewMeans: "readback_run_gate_only_not_live_execution",
    },
    items,
  };
}
