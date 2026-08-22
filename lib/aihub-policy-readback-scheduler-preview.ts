import {
  buildPolicyLiveReadbackPreview,
  type PolicyLiveReadbackPreviewItem,
  type PolicyLiveReadbackPreviewSummary,
} from "@/lib/aihub-policy-live-readback-preview";

export type PolicyReadbackScheduleSlot = "immediate" | "after_24h" | "after_72h";
export type PolicyReadbackSchedulerPreviewStatus = "readback_schedule_preview_pending_live_publish";

export type PolicyReadbackScheduleCard = {
  id: string;
  sourceLiveReadbackPreviewId: string;
  status: PolicyReadbackSchedulerPreviewStatus;
  slot: PolicyReadbackScheduleSlot;
  scheduledForPreview: string;
  title: string;
  expectedPublishedUrlPreview: string;
  officialSources: string[];
  targetChecks: string[];
  approvalRequiredBeforeRun: true;
  canCreateCron: false;
  canRunExternalReadback: false;
  blockers: string[];
  safety: {
    cronCreate: false;
    dbWrite: false;
    publish: false;
    externalFetch: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
  };
};

export type PolicyReadbackSchedulerPreviewSummary = {
  generatedFor: "AIHub 4순위 W13 정책 readback scheduler preview";
  year: 2026;
  status: "read_only_readback_scheduler_preview";
  count: number;
  sourceLiveReadbackPreview: Pick<PolicyLiveReadbackPreviewSummary, "count" | "sourceStatus" | "safety">;
  sourceStatus: "live_readback_preview_waiting_for_published_url";
  scheduleSlots: PolicyReadbackScheduleSlot[];
  safety: {
    cronCreate: false;
    dbWrite: false;
    publish: false;
    externalFetch: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
    schedulerPreviewMeans: "schedule_cards_only_not_cron_or_external_readback";
  };
  cards: PolicyReadbackScheduleCard[];
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type BuildReadbackSchedulerPreviewOptions = {
  fetcher?: FetchLike;
  itemLimit?: number;
  sourceLimit?: number;
  timeoutMs?: number;
  baseUrl?: string;
  generatedAt?: Date;
};

const SCHEDULE_SLOTS: PolicyReadbackScheduleSlot[] = ["immediate", "after_24h", "after_72h"];

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function scheduledFor(slot: PolicyReadbackScheduleSlot, generatedAt: Date): string {
  if (slot === "after_24h") return addHours(generatedAt, 24).toISOString();
  if (slot === "after_72h") return addHours(generatedAt, 72).toISOString();
  return generatedAt.toISOString();
}

function checksForSlot(item: PolicyLiveReadbackPreviewItem, slot: PolicyReadbackScheduleSlot): string[] {
  if (slot === "after_24h") {
    return [
      "GSC page/query readback preview",
      "색인 보장 표현 없이 observed 상태만 기록",
      "노출·클릭·CTR·position 첫 변화 확인",
      `공개 URL 후보: ${item.expectedPublishedUrlPreview}`,
    ];
  }

  if (slot === "after_72h") {
    return [
      "GSC impression/click/CTR/position 72h 재확인",
      "먹힌 키워드만 다음 후보 복제 후보로 표시",
      "공식 출처 변경/마감 변경 여부 재확인",
      `공식 출처 후보: ${item.officialSources.join(", ")}`,
    ];
  }

  return [
    "published URL HTTP 2xx/readable 확인 preview",
    "title/meta/body/source link 보존 확인 preview",
    "GSC/IndexNow/Naver submit은 별도 승인 후 request accepted만 기록",
    ...item.monitoringPlanPreview.immediate,
  ];
}

function blockersForSlot(item: PolicyLiveReadbackPreviewItem, slot: PolicyReadbackScheduleSlot): string[] {
  const base = [
    "W12 readback preview는 실제 발행 완료 기록이 아님",
    "published URL이 실제로 확인되지 않음",
    "cron 생성은 별도 운영 승인 필요",
    "외부 readback/fetch는 별도 승인 필요",
  ];

  if (slot !== "immediate") {
    base.push("24h/72h 측정은 실제 발행 시각 기준으로 다시 계산해야 함");
  }

  if (!item.officialSources.length) {
    base.push("공식 출처 URL 후보가 비어 있음");
  }

  return base;
}

function cardFromLiveReadbackItem(
  item: PolicyLiveReadbackPreviewItem,
  slot: PolicyReadbackScheduleSlot,
  generatedAt: Date,
): PolicyReadbackScheduleCard {
  return {
    id: `readback-schedule-preview-${slot}-${item.id}`,
    sourceLiveReadbackPreviewId: item.id,
    status: "readback_schedule_preview_pending_live_publish",
    slot,
    scheduledForPreview: scheduledFor(slot, generatedAt),
    title: item.title,
    expectedPublishedUrlPreview: item.expectedPublishedUrlPreview,
    officialSources: item.officialSources,
    targetChecks: checksForSlot(item, slot),
    approvalRequiredBeforeRun: true,
    canCreateCron: false,
    canRunExternalReadback: false,
    blockers: blockersForSlot(item, slot),
    safety: {
      cronCreate: false,
      dbWrite: false,
      publish: false,
      externalFetch: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
    },
  };
}

export async function buildPolicyReadbackSchedulerPreview(
  options: BuildReadbackSchedulerPreviewOptions = {},
): Promise<PolicyReadbackSchedulerPreviewSummary> {
  const generatedAt = options.generatedAt ?? new Date();
  const liveReadbackPreview = await buildPolicyLiveReadbackPreview(options);
  const cards = liveReadbackPreview.items.flatMap((item) =>
    SCHEDULE_SLOTS.map((slot) => cardFromLiveReadbackItem(item, slot, generatedAt)),
  );

  return {
    generatedFor: "AIHub 4순위 W13 정책 readback scheduler preview",
    year: 2026,
    status: "read_only_readback_scheduler_preview",
    count: cards.length,
    sourceLiveReadbackPreview: {
      count: liveReadbackPreview.count,
      sourceStatus: liveReadbackPreview.sourceStatus,
      safety: liveReadbackPreview.safety,
    },
    sourceStatus: "live_readback_preview_waiting_for_published_url",
    scheduleSlots: SCHEDULE_SLOTS,
    safety: {
      cronCreate: false,
      dbWrite: false,
      publish: false,
      externalFetch: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
      schedulerPreviewMeans: "schedule_cards_only_not_cron_or_external_readback",
    },
    cards,
  };
}
