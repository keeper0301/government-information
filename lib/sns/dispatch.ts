// ============================================================
// C1 — SNS 4종 통합 dispatch (Twitter·Facebook·Instagram·Threads).
// ============================================================
// blog post 1건 받아 4 채널 publish (env 설정된 것만 실제 발송).
// 결과는 채널별 ok/reason 객체 배열. partial 실패 허용.

import { publishTweet } from "./twitter";
import { publishFacebookPost } from "./facebook";
import { publishInstagramPost } from "./instagram";
import { publishThreadsPost } from "./threads";

export interface BlogPostShare {
  title: string;
  slug: string;
  description?: string | null;
  cover_image?: string | null; // 인스타 게시에 필수 — 없으면 인스타만 skip
}

export type SnsChannel = "twitter" | "facebook" | "instagram" | "threads";

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
  const igCaption = `${title}\n\n${desc}\n\n자세히: ${url}`.slice(0, 2200);
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

  // 인스타는 cover_image 필수
  if (post.cover_image) {
    tasks.push(
      publishInstagramPost({
        imageUrl: post.cover_image,
        caption: igCaption,
      }).then((r) => ({
        channel: "instagram" as SnsChannel,
        ok: r.ok,
        id: r.ok ? r.id : undefined,
        reason: r.ok ? undefined : r.reason,
      })),
    );
  } else {
    tasks.push(
      Promise.resolve({
        channel: "instagram" as SnsChannel,
        ok: false,
        reason: "no_cover_image",
      }),
    );
  }

  return Promise.all(tasks);
}
