export type FetchLogRow = {
  source_code: string;
  last_fetched_at: string | null;
  last_collected_count: number | null;
  last_error: string | null;
};

const FRESH_FETCH_LOG_HOURS = 26;

export function hasFreshSuccessfulFetchLog(
  rows: FetchLogRow[],
  nowMs = Date.now(),
): boolean {
  return rows.some((row) => {
    if (!row.last_fetched_at || row.last_error) return false;
    const ageHours = (nowMs - new Date(row.last_fetched_at).getTime()) / 3600000;
    if (!Number.isFinite(ageHours) || ageHours > FRESH_FETCH_LOG_HOURS) return false;
    return Number(row.last_collected_count ?? 0) > 0;
  });
}
