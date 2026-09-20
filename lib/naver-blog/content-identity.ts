import { createHash } from "node:crypto";

export type NaverContentIdentityInput = {
  queueId: string;
  contentId: string;
  title: string;
  bodyHtml: string;
  backlinkUrl: string;
  coverImageUrl: string | null;
};

/** Exact approval/readback identity. Any queue or payload change invalidates it. */
export function createNaverContentFingerprint(input: NaverContentIdentityInput): string {
  return createHash("sha256")
    .update(
      `${input.queueId}\n${input.contentId}\n${input.title}\n${input.bodyHtml}\n${input.backlinkUrl}\n${input.coverImageUrl ?? ""}`,
    )
    .digest("hex")
    .slice(0, 16);
}
