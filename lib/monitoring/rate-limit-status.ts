import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitHotBucket = {
  bucket: string;
  bucketClass: string;
  windowMinute: number;
  count: number;
};

export type RateLimitStatus = {
  windowMinute: number;
  lookbackMinutes: number;
  topBuckets: RateLimitHotBucket[];
  currentWindowTopBuckets: RateLimitHotBucket[];
  maxCount: number;
  totalCount: number;
  bucketClasses: Record<string, number>;
  collectedNote: string;
};

type RateLimitRow = {
  bucket?: string | null;
  window_minute?: number | string | null;
  count?: number | null;
};

const DEFAULT_LOOKBACK_MINUTES = 10;
const DEFAULT_LIMIT = 10;

export function maskRateLimitBucket(bucket: string): string {
  // bucket 예: events:ip:203.0.113.10, recommend:ip:unknown, support:user:uuid
  // 운영 알림에는 원 IP/user id 전체를 노출하지 않고 endpoint+identity class 만 남긴다.
  const parts = bucket.split(":");
  if (parts.length >= 3) {
    return `${parts[0]}:${parts[1]}:*`;
  }
  if (parts.length === 2) return `${parts[0]}:*`;
  return bucket.slice(0, 40);
}

export function getRateLimitBucketClass(bucket: string): string {
  return bucket.split(":")[0] || "unknown";
}

function normalizeRow(row: RateLimitRow): RateLimitHotBucket {
  const bucket = row.bucket ?? "unknown";
  return {
    bucket: maskRateLimitBucket(bucket),
    bucketClass: getRateLimitBucketClass(bucket),
    windowMinute: Number(row.window_minute ?? 0),
    count: row.count ?? 0,
  };
}

export async function getRateLimitStatus({
  lookbackMinutes = DEFAULT_LOOKBACK_MINUTES,
  limit = DEFAULT_LIMIT,
}: {
  lookbackMinutes?: number;
  limit?: number;
} = {}): Promise<RateLimitStatus> {
  const admin = createAdminClient();
  const windowMinute = Math.floor(Date.now() / 1000 / 60);
  const fromWindow = windowMinute - Math.max(1, lookbackMinutes) + 1;

  const { data, error } = await admin
    .from("rate_limits")
    .select("bucket, window_minute, count")
    .gte("window_minute", fromWindow)
    .order("count", { ascending: false })
    .limit(Math.max(1, limit));

  if (error) {
    throw new Error(`rate_limits query failed: ${error.message}`);
  }

  const topBuckets = ((data ?? []) as RateLimitRow[]).map(normalizeRow);
  const currentWindowTopBuckets = topBuckets.filter((row) => row.windowMinute === windowMinute);
  const bucketClasses: Record<string, number> = {};
  let totalCount = 0;
  for (const item of topBuckets) {
    totalCount += item.count;
    bucketClasses[item.bucketClass] = (bucketClasses[item.bucketClass] ?? 0) + item.count;
  }

  return {
    windowMinute,
    lookbackMinutes,
    topBuckets,
    currentWindowTopBuckets,
    maxCount: topBuckets[0]?.count ?? 0,
    totalCount,
    bucketClasses,
    collectedNote:
      "Top buckets are masked to endpoint:identity:* to avoid exposing raw IP/user identifiers.",
  };
}
