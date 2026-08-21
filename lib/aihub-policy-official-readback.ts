import {
  buildPolicyDraftQueueItems,
  type PolicyDraftQueueItem,
  type PolicyDraftQueueStatus,
} from "@/lib/aihub-policy-draft-queue";
import type { PublicReadbackCandidate } from "@/lib/aihub-policy-opportunities";

export type OfficialReadbackResult = {
  sourceName: string;
  query: string;
  searchUrl: string;
  ok: boolean;
  httpStatus: number | null;
  finalUrl: string;
  contentType: string | null;
  checked: "live_fetch";
  error?: string;
};

export type PolicyReadbackQueueItem = Omit<PolicyDraftQueueItem, "status" | "promotionBlockedReason"> & {
  status: Extract<PolicyDraftQueueStatus, "needs_fact_readback" | "ready_for_draft">;
  readbackResults: OfficialReadbackResult[];
  successfulReadbackCount: number;
  promotionBlockedReason: string;
};

export type PolicyReadbackPreviewSummary = {
  generatedFor: "AIHub 4순위 W3 공식 원문 readback preview lane";
  year: 2026;
  status: "read_only_official_readback_preview";
  count: number;
  checkedItemCount: number;
  countsByStatus: {
    needs_fact_readback: number;
    ready_for_draft: number;
    humanize_required: 0;
    review_required: 0;
  };
  readbackLimit: number;
  readbackSourceLimit: number;
  safety: {
    dbWrite: false;
    publish: false;
    gscSubmit: false;
    indexNowSubmit: false;
    naverSubmit: false;
    largeCrawl: false;
    readyForDraftMeans: "official_search_source_reachable_preview_not_publish_approval";
  };
  items: PolicyReadbackQueueItem[];
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type ReadbackOptions = {
  fetcher?: FetchLike;
  itemLimit?: number;
  sourceLimit?: number;
  timeoutMs?: number;
};

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value) || !value || value < 1) return fallback;
  return Math.min(Math.floor(value), max);
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
  return controller.signal;
}

async function checkCandidate(candidate: PublicReadbackCandidate, fetcher: FetchLike, timeoutMs: number): Promise<OfficialReadbackResult> {
  try {
    const response = await fetcher(candidate.searchUrl, {
      cache: "no-store",
      headers: { "User-Agent": "HermesReadback/1.0" },
      redirect: "follow",
      signal: timeoutSignal(timeoutMs),
    });

    return {
      sourceName: candidate.sourceName,
      query: candidate.query,
      searchUrl: candidate.searchUrl,
      ok: response.status >= 200 && response.status < 400,
      httpStatus: response.status,
      finalUrl: response.url || candidate.searchUrl,
      contentType: response.headers.get("content-type"),
      checked: "live_fetch",
    };
  } catch (error) {
    return {
      sourceName: candidate.sourceName,
      query: candidate.query,
      searchUrl: candidate.searchUrl,
      ok: false,
      httpStatus: null,
      finalUrl: candidate.searchUrl,
      contentType: null,
      checked: "live_fetch",
      error: error instanceof Error ? error.message : "unknown_error",
    };
  }
}

export async function buildPolicyOfficialReadbackPreview(
  items: readonly PolicyDraftQueueItem[] = buildPolicyDraftQueueItems(),
  options: ReadbackOptions = {},
): Promise<PolicyReadbackPreviewSummary> {
  const readbackLimit = clampLimit(options.itemLimit, 5, 5);
  const readbackSourceLimit = clampLimit(options.sourceLimit, 2, 2);
  const timeoutMs = clampLimit(options.timeoutMs, 5000, 10000);
  const fetcher = options.fetcher ?? fetch;
  const targetItems = items.slice(0, readbackLimit);

  const enrichedItems: PolicyReadbackQueueItem[] = await Promise.all(
    targetItems.map(async (item) => {
      const readbackResults = await Promise.all(
        item.readbackCandidates.slice(0, readbackSourceLimit).map((candidate) => checkCandidate(candidate, fetcher, timeoutMs)),
      );
      const successfulReadbackCount = readbackResults.filter((result) => result.ok).length;
      const status = successfulReadbackCount > 0 ? "ready_for_draft" : "needs_fact_readback";
      return {
        ...item,
        status,
        readbackResults,
        successfulReadbackCount,
        promotionBlockedReason:
          status === "ready_for_draft"
            ? "공식 검색 원문 접속 확인됨. 초안 작성 전 세부 신청조건·기간·서류는 계속 검토 필요"
            : "공식 원문 readback 성공 전에는 ready_for_draft로 승격하지 않음",
      };
    }),
  );

  const readyCount = enrichedItems.filter((item) => item.status === "ready_for_draft").length;
  const needsCount = enrichedItems.length - readyCount;

  return {
    generatedFor: "AIHub 4순위 W3 공식 원문 readback preview lane",
    year: 2026,
    status: "read_only_official_readback_preview",
    count: enrichedItems.length,
    checkedItemCount: enrichedItems.length,
    countsByStatus: {
      needs_fact_readback: needsCount,
      ready_for_draft: readyCount,
      humanize_required: 0,
      review_required: 0,
    },
    readbackLimit,
    readbackSourceLimit,
    safety: {
      dbWrite: false,
      publish: false,
      gscSubmit: false,
      indexNowSubmit: false,
      naverSubmit: false,
      largeCrawl: false,
      readyForDraftMeans: "official_search_source_reachable_preview_not_publish_approval",
    },
    items: enrichedItems,
  };
}
