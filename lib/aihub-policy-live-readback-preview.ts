import {
  buildPolicyLivePublishPreflightPreview,
  type PolicyLivePublishPreflightPreviewItem,
  type PolicyLivePublishPreflightPreviewSummary,
} from "@/lib/aihub-policy-live-publish-preflight-preview";

export type PolicyLiveReadbackPreviewStatus = "live_readback_preview_waiting_for_published_url";

export type PolicyLiveReadbackPreviewItem = {
  id: string;
  sourcePreflightPreviewId: string;
  status: PolicyLiveReadbackPreviewStatus;
  title: string;
  metaDescription: string;
  officialSources: string[];
  expectedPublishedUrlPreview: string;
  readbackSummary: string;
  readbackTargets: Array<{
    name: string;
    target: string;
    requiredBeforeDone: true;
    liveRequestSent: false;
  }>;
  liveVerificationChecklist: string[];
  monitoringPlanPreview: {
    immediate: string[];
    after24h: string[];
    after72h: string[];
  };
  liveGate: {
    publishedUrlKnown: false;
    readyForDone: false;
    reason: "live_readback_preview_waits_for_actual_publish_and_url_readback";
  };
  safety: {
    dbWrite: false;
    approvalWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
    externalFetch: false;
  };
};

export type PolicyLiveReadbackPreviewSummary = {
  generatedFor: "AIHub 4순위 W12 정책 live readback preview";
  year: 2026;
  status: "read_only_live_readback_preview";
  count: number;
  sourcePreflightPreview: Pick<PolicyLivePublishPreflightPreviewSummary, "count" | "sourceStatus" | "safety">;
  sourceStatus: "live_publish_preflight_preview_blocked";
  safety: {
    dbWrite: false;
    approvalWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
    externalFetch: false;
    liveReadbackPreviewMeans: "post_publish_verification_plan_only_not_a_publish_or_submit_action";
  };
  items: PolicyLiveReadbackPreviewItem[];
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type BuildLiveReadbackPreviewOptions = {
  fetcher?: FetchLike;
  itemLimit?: number;
  sourceLimit?: number;
  timeoutMs?: number;
  baseUrl?: string;
};

function slugifyTitle(title: string): string {
  const asciiSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return asciiSlug || "policy-preview";
}

function buildExpectedUrl(item: PolicyLivePublishPreflightPreviewItem, baseUrl?: string): string {
  const safeBase = (baseUrl ?? "https://keeper0301.com").replace(/\/$/, "");
  return `${safeBase}/policy/${slugifyTitle(item.title)}`;
}

function buildReadbackSummary(item: PolicyLivePublishPreflightPreviewItem): string {
  return `${item.title} 항목이 실제 발행된 뒤 확인해야 할 공개 URL, 검색 제출, 색인/노출 측정 항목을 미리 묶습니다. 이 W12 응답은 확인 계획 preview이며 실제 발행이나 외부 제출을 수행하지 않습니다.`;
}

function buildReadbackTargets(item: PolicyLivePublishPreflightPreviewItem, expectedPublishedUrlPreview: string): PolicyLiveReadbackPreviewItem["readbackTargets"] {
  return [
    {
      name: "published_page_http_readback",
      target: expectedPublishedUrlPreview,
      requiredBeforeDone: true,
      liveRequestSent: false,
    },
    {
      name: "official_source_readback",
      target: item.officialSources.join(", "),
      requiredBeforeDone: true,
      liveRequestSent: false,
    },
    {
      name: "gsc_submit_readback",
      target: "Google Search Console submit은 별도 승인 후 request accepted 상태만 확인",
      requiredBeforeDone: true,
      liveRequestSent: false,
    },
    {
      name: "indexnow_submit_readback",
      target: "IndexNow submit은 별도 승인 후 accepted response만 확인",
      requiredBeforeDone: true,
      liveRequestSent: false,
    },
    {
      name: "naver_submit_readback",
      target: "Naver submit은 별도 승인 후 제출/반영 가능 상태만 확인",
      requiredBeforeDone: true,
      liveRequestSent: false,
    },
  ];
}

function buildLiveVerificationChecklist(item: PolicyLivePublishPreflightPreviewItem): string[] {
  return [
    "실제 발행 완료 후 공개 URL HTTP 2xx 확인",
    "공개 URL title/meta/본문에 공식 출처와 핵심 숫자·기간·대상이 보존됐는지 확인",
    "본문에 미확인 신청 가능·금액·혜택 단정이 없는지 확인",
    "공식 출처 URL이 계속 열리는지 재확인",
    "GSC submit은 별도 승인 후 request accepted까지만 기록, 색인 보장은 금지",
    "IndexNow submit은 별도 승인 후 accepted response까지만 기록",
    "Naver submit은 별도 승인 후 제출/반영 가능 상태만 기록",
    "24h/72h 후 GSC 노출·클릭·CTR·position readback 예약",
    `공식 출처 후보: ${item.officialSources.join(", ")}`,
  ];
}

function liveReadbackItemFromPreflight(
  item: PolicyLivePublishPreflightPreviewItem,
  baseUrl?: string,
): PolicyLiveReadbackPreviewItem {
  const expectedPublishedUrlPreview = buildExpectedUrl(item, baseUrl);
  return {
    id: `live-readback-preview-${item.id}`,
    sourcePreflightPreviewId: item.id,
    status: "live_readback_preview_waiting_for_published_url",
    title: item.title,
    metaDescription: item.metaDescription,
    officialSources: item.officialSources,
    expectedPublishedUrlPreview,
    readbackSummary: buildReadbackSummary(item),
    readbackTargets: buildReadbackTargets(item, expectedPublishedUrlPreview),
    liveVerificationChecklist: buildLiveVerificationChecklist(item),
    monitoringPlanPreview: {
      immediate: [
        "published URL 2xx/readable 확인",
        "title/meta/body/source link readback",
        "외부 submit은 승인 범위별 request accepted만 기록",
      ],
      after24h: ["GSC page/query readback", "색인 보장 표현 없이 accepted/observed 상태만 보고"],
      after72h: ["GSC impression/click/CTR/position 재확인", "먹힌 키워드만 다음 후보로 복제"],
    },
    liveGate: {
      publishedUrlKnown: false,
      readyForDone: false,
      reason: "live_readback_preview_waits_for_actual_publish_and_url_readback",
    },
    safety: {
      dbWrite: false,
      approvalWrite: false,
      publish: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
      externalFetch: false,
    },
  };
}

export async function buildPolicyLiveReadbackPreview(
  options: BuildLiveReadbackPreviewOptions = {},
): Promise<PolicyLiveReadbackPreviewSummary> {
  const preflightPreview = await buildPolicyLivePublishPreflightPreview(options);
  const items = preflightPreview.items.map((item) => liveReadbackItemFromPreflight(item, options.baseUrl));

  return {
    generatedFor: "AIHub 4순위 W12 정책 live readback preview",
    year: 2026,
    status: "read_only_live_readback_preview",
    count: items.length,
    sourcePreflightPreview: {
      count: preflightPreview.count,
      sourceStatus: preflightPreview.sourceStatus,
      safety: preflightPreview.safety,
    },
    sourceStatus: "live_publish_preflight_preview_blocked",
    safety: {
      dbWrite: false,
      approvalWrite: false,
      publish: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
      externalFetch: false,
      liveReadbackPreviewMeans: "post_publish_verification_plan_only_not_a_publish_or_submit_action",
    },
    items,
  };
}
