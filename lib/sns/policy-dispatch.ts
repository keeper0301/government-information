// ============================================================
// B 1차 — 인기 정책 SNS 통합 dispatch (Twitter·Facebook·Threads)
// ============================================================
// 정책 1건 받아 3 채널 publish (env 설정된 것만 실제 발송).
// 결과는 채널별 ok/reason 객체 배열. partial 실패 허용.
// blog dispatch (lib/sns/dispatch.ts) 와 분리 — 정책 URL 패턴 + 캡션 형식 다름.
// ============================================================

import { publishTweet } from "./twitter";
import { publishFacebookPost } from "./facebook";
import { publishThreadsPost } from "./threads";

export interface PolicyShare {
  id: string;
  title: string;
  table: "welfare_programs" | "loan_programs";
  region: string | null;
  apply_end: string | null;
}

export type SnsChannel = "twitter" | "facebook" | "threads";

export interface SnsDispatchResult {
  channel: SnsChannel;
  ok: boolean;
  id?: string;
  reason?: string;
}

const SITE_BASE = "https://www.keepioo.com";

// B 2차: 캡션 prefix 단일 source — 마케팅 톤 변경 시 한 군데만 수정 (review L4)
const POPULARITY_CAPTION_PREFIX = "🔥 이번 주 인기 정책";

// 캡션 빌더 — 정책 URL + 마감일 + 지역 정보.
// 사용자 즉시 매력적인 정보 (가장 끌리는 부분) 우선 노출.
function buildCaption(post: PolicyShare): {
  tweet: string;
  facebook: string;
  threads: string;
  url: string;
} {
  const pathPrefix = post.table === "welfare_programs" ? "welfare" : "loan";
  const url = `${SITE_BASE}/${pathPrefix}/${post.id}`;
  const regionPart = post.region ? `[${post.region}] ` : "";
  const endPart = post.apply_end ? ` (마감 ${post.apply_end})` : "";

  // Twitter — 280자
  const tweet = `${POPULARITY_CAPTION_PREFIX}\n\n${regionPart}${post.title}${endPart}\n\n${url}`
    .slice(0, 280);

  // Facebook — 500자 (link 별도)
  const facebook =
    `${POPULARITY_CAPTION_PREFIX}\n\n${regionPart}${post.title}${endPart}\n\n자세히 보기 ↓`.slice(
      0,
      500,
    );

  // Threads — 500자
  const threads = `${POPULARITY_CAPTION_PREFIX}\n\n${regionPart}${post.title}${endPart}\n\n${url}`
    .slice(0, 500);

  return { tweet, facebook, threads, url };
}

// 정책 1건 → 3 채널 동시 publish.
export async function dispatchPolicyToSns(
  post: PolicyShare,
): Promise<SnsDispatchResult[]> {
  const { tweet, facebook, threads, url } = buildCaption(post);

  const tasks: Array<Promise<SnsDispatchResult>> = [
    publishTweet(tweet).then((r) => ({
      channel: "twitter" as SnsChannel,
      ok: r.ok,
      id: r.ok ? r.id : undefined,
      reason: r.ok ? undefined : r.reason,
    })),
    publishFacebookPost({ message: facebook, link: url }).then((r) => ({
      channel: "facebook" as SnsChannel,
      ok: r.ok,
      id: r.ok ? r.id : undefined,
      reason: r.ok ? undefined : r.reason,
    })),
    publishThreadsPost({ text: threads }).then((r) => ({
      channel: "threads" as SnsChannel,
      ok: r.ok,
      id: r.ok ? r.id : undefined,
      reason: r.ok ? undefined : r.reason,
    })),
  ];

  return Promise.all(tasks);
}
