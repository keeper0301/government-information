// ============================================================
// C1 — SNS 3종 통합 dispatch (Twitter·Facebook·Threads).
// ============================================================
// blog post 1건 받아 3 채널 publish (env 설정된 것만 실제 발송).
// 결과는 채널별 ok/reason 객체 배열. partial 실패 허용.
//
// 인스타는 별도 cron (/api/cron/instagram-publish) 가 DB-based OAuth token + carousel
// 발행으로 처리. dispatch 에 포함 X (2026-05-14 review 정리).

import { publishTweet } from "./twitter";
import { publishFacebookPost } from "./facebook";
import { publishThreadsPost } from "./threads";

export interface BlogPostShare {
  title: string;
  slug: string;
  description?: string | null;
}

export type SnsChannel = "twitter" | "facebook" | "threads";

export interface SnsDispatchResult {
  channel: SnsChannel;
  ok: boolean;
  id?: string;
  reason?: string;
}

const SITE_BASE = "https://www.keepioo.com";

export async function dispatchBlogToSns(
  post: BlogPostShare,
): Promise<SnsDispatchResult[]> {
  const url = `${SITE_BASE}/blog/${post.slug}`;
  const title = post.title;
  // 캡션 / 메시지 — 채널별 길이 제한. 단순 한국어 default.
  const desc = post.description?.slice(0, 100) ?? "";
  const tweetText = `${title.slice(0, 200)}\n\n${url}`.slice(0, 280);
  const fbMessage = `${title}\n\n${desc}`.slice(0, 500);
  const threadsText = `${title.slice(0, 350)}\n\n${url}`.slice(0, 500);

  const tasks: Array<Promise<SnsDispatchResult>> = [
    publishTweet(tweetText).then((r) => ({
      channel: "twitter" as SnsChannel,
      ok: r.ok,
      id: r.ok ? r.id : undefined,
      reason: r.ok ? undefined : r.reason,
    })),
    publishFacebookPost({ message: fbMessage, link: url }).then((r) => ({
      channel: "facebook" as SnsChannel,
      ok: r.ok,
      id: r.ok ? r.id : undefined,
      reason: r.ok ? undefined : r.reason,
    })),
    publishThreadsPost({ text: threadsText }).then((r) => ({
      channel: "threads" as SnsChannel,
      ok: r.ok,
      id: r.ok ? r.id : undefined,
      reason: r.ok ? undefined : r.reason,
    })),
  ];

  return Promise.all(tasks);
}
