import type { SnsChannel } from "./dispatch";

type SnsRunDetails = {
  id?: string;
  results?: Array<{ channel?: string; ok?: boolean }>;
} | null;

export type SnsRunRow = { details?: SnsRunDetails };

const ALL_CHANNELS: SnsChannel[] = ["twitter", "facebook", "threads"];

export function successfulChannelsForPost(
  rows: SnsRunRow[],
  postId: string,
): Set<SnsChannel> {
  const channels = new Set<SnsChannel>();
  for (const row of rows) {
    if (row.details?.id !== postId) continue;
    for (const result of row.details.results ?? []) {
      if (
        result.ok === true &&
        (result.channel === "twitter" ||
          result.channel === "facebook" ||
          result.channel === "threads")
      ) {
        channels.add(result.channel);
      }
    }
  }
  return channels;
}

export function pendingChannelsForPost(
  rows: SnsRunRow[],
  postId: string,
): SnsChannel[] {
  const successful = successfulChannelsForPost(rows, postId);
  return ALL_CHANNELS.filter((channel) => !successful.has(channel));
}
