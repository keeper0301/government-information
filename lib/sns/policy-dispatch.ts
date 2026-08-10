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
  target?: string | null;
  eligibility?: string | null;
  benefits?: string | null;
  loan_amount?: string | null;
  interest_rate?: string | null;
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

// B 2차: 캡션 prefix 단일 source — 마케팅 톤 변경 시 한 군데만 수정 (review L4)
const POPULARITY_CAPTION_PREFIX = "🔥 이번 주 인기 정책";

function cleanLine(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .trim();
}

function ellipsize(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function firstUsefulDescriptionLine(description: string | null | undefined): string {
  const lines = (description ?? "")
    .split(/\n+/)
    .map((line) => cleanLine(line).replace(/^(지원대상|상세조건|대출용도|대출한도|취급기관|문의|모집기한):\s*/, ""))
    .filter((line) => line.length >= 8 && !/^자금소진시까지$/.test(line));
  return lines[0] ?? "대상 조건과 신청 가능 여부는 원문 기준으로 확인해야 합니다.";
}

function buildSupportLine(post: PolicyShare): string {
  if (post.loan_amount) {
    const rate = post.interest_rate ? `, 금리 ${cleanLine(post.interest_rate)}` : "";
    return `지원: 최대 ${cleanLine(post.loan_amount)} 자금${rate}`;
  }
  if (post.benefits) return `지원: ${cleanLine(post.benefits)}`;
  return `핵심: ${ellipsize(firstUsefulDescriptionLine(post.description), 54)}`;
}

export function buildPolicySnsCaption(post: PolicyShare): {
  tweet: string;
  facebook: string;
  threads: string;
  url: string;
} {
  const pathPrefix = post.table === "welfare_programs" ? "welfare" : "loan";
  const url = `${SITE_BASE}/${pathPrefix}/${post.id}`;
  const title = cleanLine(post.title);
  const regionPart = post.region ? `[${cleanLine(post.region)}] ` : "";
  const endPart = post.apply_end ? ` (마감 ${post.apply_end})` : "";
  const target = cleanLine(post.target || post.eligibility);
  const targetLine = target
    ? `대상: ${ellipsize(target, 44)}`
    : `대상: ${ellipsize(firstUsefulDescriptionLine(post.description), 44)}`;
  const supportLine = buildSupportLine(post);
  const deadlineLine = post.apply_end
    ? `마감: ${post.apply_end}`
    : post.table === "loan_programs"
      ? "기간: 보통 자금 소진 때까지라 먼저 확인하는 게 좋습니다."
      : "기간: 상시/지자체 기준일 수 있어 원문 확인이 필요합니다.";

  const tweet = `${POPULARITY_CAPTION_PREFIX}\n\n${regionPart}${post.title}${endPart}\n\n${url}`
    .slice(0, 280);

  // Facebook — 500자 (link 별도)
  const facebook =
    `${POPULARITY_CAPTION_PREFIX}\n\n${regionPart}${post.title}${endPart}\n\n자세히 보기 ↓`.slice(
      0,
      500,
    );

  // Threads — 제목+링크 단독 게시로 퇴화하면 caption gate가 차단한다.
  // 인기 정책 자동 노출도 최소 3줄 이상의 판단 가능한 정보(대상/지원/기간)를 같이 넣는다.
  const threads = [
    `${regionPart}${title}`,
    "",
    "이번 주 keepioo에서 조회가 많이 나온 정책입니다.",
    targetLine,
    supportLine,
    deadlineLine,
    "",
    "내 조건에 맞는지 먼저 확인하세요.",
    url,
  ].join("\n").slice(0, 500);

  return { tweet, facebook, threads, url };
}

// 정책 1건 → 3 채널 동시 publish.
export async function dispatchPolicyToSns(
  post: PolicyShare,
  opts: { channels?: SnsChannel[] } = {},
): Promise<SnsDispatchResult[]> {
  const { tweet, facebook, threads, url } = buildPolicySnsCaption(post);
  const channelSet = new Set(opts.channels ?? ["twitter", "facebook", "threads"]);

  const tasks: Array<Promise<SnsDispatchResult>> = [];
  if (channelSet.has("twitter")) {
    tasks.push(publishTweet(tweet).then((r) => ({
      channel: "twitter" as SnsChannel,
      ok: r.ok,
      id: r.ok ? r.id : undefined,
      reason: r.ok ? undefined : r.reason,
    })));
  }
  if (channelSet.has("facebook")) {
    tasks.push(publishFacebookPost({ message: facebook, link: url }).then((r) => ({
      channel: "facebook" as SnsChannel,
      ok: r.ok,
      id: r.ok ? r.id : undefined,
      reason: r.ok ? undefined : r.reason,
    })));
  }
  if (channelSet.has("threads")) {
    tasks.push(publishThreadsPost({ text: threads }).then((r) => ({
      channel: "threads" as SnsChannel,
      ok: r.ok,
      id: r.ok ? r.id : undefined,
      reason: r.ok ? undefined : r.reason,
    })));
  }

  return Promise.all(tasks);
}
