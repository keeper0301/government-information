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
const ALL_CHANNELS: SnsChannel[] = ["twitter", "facebook", "threads"];
const THREADS_TEXT_LIMIT = 500;

function normalizeShareText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])(?=\s|$)/g, "$1")
    .trim();
}

function splitKoreanSentences(value: string): string[] {
  const normalized = normalizeShareText(value);
  if (!normalized) return [];
  return normalized
    .split(/(?<=[.!?。！？]|[가-힣]\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function appendWithinLimit(lines: string[], line: string, fixedTail: string): boolean {
  const candidate = [...lines, line, fixedTail].join("\n");
  if (candidate.length > THREADS_TEXT_LIMIT) return false;
  lines.push(line);
  return true;
}

function buildBlogUrl(slug: string): string {
  return `${SITE_BASE}/blog/${encodeURIComponent(slug)}`;
}

function ellipsize(value: string, maxLength: number): string {
  if (maxLength <= 0) return "";
  if (value.length <= maxLength) return value;
  if (maxLength === 1) return "…";
  return `${value.slice(0, maxLength - 1).trim()}…`;
}

export function buildThreadsText(post: BlogPostShare): string {
  const url = buildBlogUrl(post.slug);
  const title = normalizeShareText(post.title);
  const fallback =
    "대상 조건, 신청 시점, 준비할 내용을 먼저 확인하세요. 해당되는 사람은 마감과 기준이 달라질 수 있어 원문 확인이 필요합니다.";
  const sentences = splitKoreanSentences(post.description ?? fallback);
  const summary = normalizeShareText(sentences[0] ?? fallback);
  const points = sentences.slice(1, 4).map(normalizeShareText).filter(Boolean);
  const tail = `\n자세히 보기\n${url}`;
  const lines = [title, "", "핵심 요약", summary];

  if (points.length > 0) {
    appendWithinLimit(lines, "", tail);
    appendWithinLimit(lines, "확인 포인트", tail);
    for (const point of points) {
      if (!appendWithinLimit(lines, `• ${point}`, tail)) break;
    }
  }

  const text = `${lines.join("\n")}\n${tail}`;
  if (text.length <= THREADS_TEXT_LIMIT) return text;

  const minimalTemplate = (safeTitle: string, safeSummary: string) =>
    `${safeTitle}\n\n핵심 요약\n${safeSummary}\n\n자세히 보기\n${url}`;
  const fixedWithoutTitleAndSummary = "\n\n핵심 요약\n\n자세히 보기\n".length + url.length;
  const minSummaryLength = 40;
  const titleBudget = Math.max(
    1,
    THREADS_TEXT_LIMIT - fixedWithoutTitleAndSummary - minSummaryLength,
  );
  const safeTitle = ellipsize(title, titleBudget);
  const summaryBudget = Math.max(
    0,
    THREADS_TEXT_LIMIT - minimalTemplate(safeTitle, "").length,
  );
  const safeSummary = ellipsize(summary, summaryBudget);
  const fallbackText = minimalTemplate(safeTitle, safeSummary);

  return fallbackText.length <= THREADS_TEXT_LIMIT
    ? fallbackText
    : `${ellipsize(title, Math.max(1, THREADS_TEXT_LIMIT - tail.length - 2))}\n${tail}`.slice(0, THREADS_TEXT_LIMIT);
}

export async function dispatchBlogToSns(
  post: BlogPostShare,
  opts: { channels?: SnsChannel[] } = {},
): Promise<SnsDispatchResult[]> {
  const url = buildBlogUrl(post.slug);
  const title = post.title;
  // 캡션 / 메시지 — 채널별 길이 제한. 단순 한국어 default.
  const desc = post.description?.slice(0, 100) ?? "";
  const tweetTitle = ellipsize(title, Math.max(1, 280 - url.length - 2));
  const tweetText = `${tweetTitle}\n\n${url}`.slice(0, 280);
  const fbMessage = `${title}\n\n${desc}`.slice(0, 500);
  const threadsText = buildThreadsText(post);
  const channelSet = new Set(opts.channels ?? ALL_CHANNELS);

  const tasks: Array<Promise<SnsDispatchResult>> = [];
  if (channelSet.has("twitter")) {
    tasks.push(publishTweet(tweetText).then((r) => ({
      channel: "twitter" as SnsChannel,
      ok: r.ok,
      id: r.ok ? r.id : undefined,
      reason: r.ok ? undefined : r.reason,
    })));
  }
  if (channelSet.has("facebook")) {
    tasks.push(publishFacebookPost({ message: fbMessage, link: url }).then((r) => ({
      channel: "facebook" as SnsChannel,
      ok: r.ok,
      id: r.ok ? r.id : undefined,
      reason: r.ok ? undefined : r.reason,
    })));
  }
  if (channelSet.has("threads")) {
    tasks.push(publishThreadsPost({ text: threadsText }).then((r) => ({
      channel: "threads" as SnsChannel,
      ok: r.ok,
      id: r.ok ? r.id : undefined,
      reason: r.ok ? undefined : r.reason,
    })));
  }

  return Promise.all(tasks);
}
