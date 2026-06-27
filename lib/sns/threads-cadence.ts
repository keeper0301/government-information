import type { SnsChannel } from "./dispatch";
import type { SnsRunRow } from "./publish-dedupe";

export type ThreadsCadenceRunRow = SnsRunRow & { created_at?: string | null };

export type ThreadsCadenceState = {
  dailyCap: number;
  minHoursBetweenPosts: number;
  successfulInWindow: number;
  lastSuccessAt: Date | null;
  reservedThisRun: number;
};

export type ThreadsCadenceDecision = {
  channels: SnsChannel[];
  skippedReason?: string;
};

type ThreadsCadenceEnv = Record<string, string | undefined>;

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function rowHasThreadsSuccess(row: ThreadsCadenceRunRow): boolean {
  return Boolean(row.details?.results?.some((result) => result.channel === "threads" && result.ok === true));
}

export function createThreadsCadenceState(
  rows: ThreadsCadenceRunRow[],
  env: ThreadsCadenceEnv = process.env,
): ThreadsCadenceState {
  const successfulRows = rows.filter(rowHasThreadsSuccess);
  const successTimes = successfulRows
    .map((row) => (row.created_at ? new Date(row.created_at) : null))
    .filter((date): date is Date => date instanceof Date && !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());

  return {
    dailyCap: parsePositiveInteger(env.THREADS_DAILY_CAP, 1),
    minHoursBetweenPosts: parsePositiveInteger(env.THREADS_MIN_HOURS_BETWEEN_POSTS, 24),
    successfulInWindow: successfulRows.length,
    lastSuccessAt: successTimes[0] ?? null,
    reservedThisRun: 0,
  };
}

export function applyThreadsCadence(
  channels: SnsChannel[],
  state: ThreadsCadenceState,
  now: Date = new Date(),
): ThreadsCadenceDecision {
  if (!channels.includes("threads")) return { channels };

  const withoutThreads = channels.filter((channel) => channel !== "threads");
  if (state.dailyCap <= 0) {
    return { channels: withoutThreads, skippedReason: "threads_daily_cap_zero" };
  }

  if (state.successfulInWindow + state.reservedThisRun >= state.dailyCap) {
    return { channels: withoutThreads, skippedReason: "threads_daily_cap_reached" };
  }

  if (state.lastSuccessAt && state.minHoursBetweenPosts > 0) {
    const elapsedHours = (now.getTime() - state.lastSuccessAt.getTime()) / (60 * 60 * 1000);
    if (elapsedHours < state.minHoursBetweenPosts) {
      return { channels: withoutThreads, skippedReason: "threads_min_interval" };
    }
  }

  state.reservedThisRun += 1;
  return { channels };
}
