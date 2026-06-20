// ============================================================
// C1 — SNS 3종 통합 dispatch (Twitter·Facebook·Threads).
// ============================================================
// blog post 1건 받아 3 채널 publish (env 설정된 것만 실제 발송).
// 결과는 채널별 ok/reason 객체 배열. partial 실패 허용.
//
// 인스타는 별도 cron (/api/cron/instagram-publish) 가 DB-based OAuth token + carousel
// 발행으로 처리. dispatch 에 포함 X (2026-05-14 review 정리).

import { loadSnsLeadPolicySnapshot, type SnsLeadVariant } from "@/lib/sns-control-tower/lead-policy";
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
const CHECK_POINT_LIMIT = 3;

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

function stableBucket(value: string, buckets: number): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  }
  return hash % buckets;
}

function buildBlogUrl(
  slug: string,
  source?: SnsChannel,
  content?: string,
): string {
  const base = `${SITE_BASE}/blog/${encodeURIComponent(slug)}`;
  if (!source) return base;
  const params = new URLSearchParams({
    utm_source: source,
    utm_medium: "social",
    utm_campaign: "blog_auto",
  });
  if (content) params.set("utm_content", content);
  return `${base}?${params.toString()}`;
}

function ellipsize(value: string, maxLength: number): string {
  if (maxLength <= 0) return "";
  if (value.length <= maxLength) return value;
  if (maxLength === 1) return "…";
  return `${value.slice(0, maxLength - 1).trim()}…`;
}

function detectRegion(title: string): string | null {
  const match = title.match(
    /([가-힣]{2,}(?:특별시|광역시|특별자치시|특별자치도|도|시|군|구))/,
  );
  return match?.[1] ?? null;
}

function detectAudience(title: string): string | null {
  const rules: Array<[RegExp, string]> = [
    [/장애인|장애인가정/, "장애인가정에 해당된다면"],
    [/청년|대학생|취업준비|구직/, "청년이거나 취업을 준비 중이라면"],
    [/소상공인|자영업|전통시장/, "가게를 운영 중이라면"],
    [/중소기업|창업기업|스타트업|벤처/, "사업을 운영하거나 창업을 준비 중이라면"],
    [/신혼부부|출산|임신|육아|아동|부모/, "출산·육아 지원을 확인 중이라면"],
    [/어르신|노인|기초연금/, "부모님이나 본인의 복지 혜택을 확인 중이라면"],
    [/대출|자금|보증|융자/, "자금 지원이 필요하다면"],
  ];
  return rules.find(([pattern]) => pattern.test(title))?.[1] ?? null;
}

function detectAction(title: string): string {
  if (/마감|접수|신청/.test(title)) {
    return "신청 조건과 마감부터 먼저 확인하세요.";
  }
  if (/지원금|장려금|급여|수당|자금|대출|융자|보증/.test(title)) {
    return "받을 수 있는 금액과 신청 조건부터 먼저 확인하세요.";
  }
  if (/모집|공고|선정|참여기업|수행기관/.test(title)) {
    return "대상 여부와 준비 서류부터 먼저 확인하세요.";
  }
  return "내 조건에 맞는지 핵심만 먼저 확인하세요.";
}

function buildHumanLead(title: string, variant: number): string {
  const region = detectRegion(title);
  const audience = detectAudience(title);
  const action = detectAction(title);
  const prefix = [region ? `${region}에서` : null, audience]
    .filter(Boolean)
    .join(" ");
  const subject = prefix || "이 정책이 내 상황에 맞는지";
  const direct = `${subject} ${action}`;
  const lossAvoidance = `${subject} 조건이 맞는데 놓치면 아까운 지원입니다. ${action}`;
  const checklist = `${subject} 신청 전 3가지만 보세요: 대상, 혜택, 마감.`;
  return [direct, lossAvoidance, checklist][variant] ?? direct;
}

function fallbackCheckPoints(title: string): string[] {
  const points = ["대상 조건", "지원 금액·내용", "신청 방법·마감"];
  if (/서류|준비/.test(title)) points[1] = "준비 서류";
  if (/대출|자금|보증|융자/.test(title)) points[1] = "한도·금리·상환 조건";
  if (/모집|공고|참여기업|수행기관/.test(title)) points[1] = "선정 기준·준비 자료";
  return points.map((point) => `${point} 확인`);
}

function buildCheckPoints(title: string, points: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const point of [...points, ...fallbackCheckPoints(title)]) {
    const clean = ellipsize(normalizeShareText(point), 86);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= CHECK_POINT_LIMIT) break;
  }
  return out;
}

function selectLeadVariant(seed: string, disabledLeadVariants: SnsLeadVariant[] = []): number {
  const disabled = new Set(disabledLeadVariants);
  const enabled = (["lead_0", "lead_1", "lead_2"] as SnsLeadVariant[]).filter((lead) => !disabled.has(lead));
  const candidates = enabled.length > 0 ? enabled : (["lead_0", "lead_1", "lead_2"] as SnsLeadVariant[]);
  const selected = candidates[stableBucket(seed, candidates.length)];
  return Number(selected.replace("lead_", ""));
}

export function buildThreadsText(
  post: BlogPostShare,
  opts: { disabledLeadVariants?: SnsLeadVariant[] } = {},
): string {
  const title = normalizeShareText(post.title);
  const variant = selectLeadVariant(`${post.slug}:${title}`, opts.disabledLeadVariants);
  const url = buildBlogUrl(post.slug, "threads", `lead_${variant}`);
  const fallback =
    "대상 조건, 신청 시점, 준비할 내용을 먼저 확인하세요. 해당되는 사람은 마감과 기준이 달라질 수 있어 원문 확인이 필요합니다.";
  const hasDescription = Boolean(post.description?.trim());
  const sentences = splitKoreanSentences(hasDescription ? post.description! : fallback);
  const summary = normalizeShareText(sentences[0] ?? fallback);
  const points = hasDescription
    ? sentences.slice(1, 4).map(normalizeShareText).filter(Boolean)
    : [];
  const readablePoints = buildCheckPoints(title, points);
  const tail = `\n자세히 보기\n${url}`;
  const lead = buildHumanLead(title, variant);
  const lines = [lead, "", "원문", title, "", "핵심 요약", summary];

  let addedPoints = 0;
  if (readablePoints.length > 0) {
    const sectionStart = [...lines, "", "확인 포인트"];
    const firstPointCandidate = [...sectionStart, `• ${readablePoints[0]}`, tail].join("\n");
    if (firstPointCandidate.length <= THREADS_TEXT_LIMIT) {
      lines.push("", "확인 포인트");
      for (const point of readablePoints) {
        if (!appendWithinLimit(lines, `• ${point}`, tail)) break;
        addedPoints += 1;
      }
    }
  }

  const text = `${lines.join("\n")}\n${tail}`;
  if (text.length <= THREADS_TEXT_LIMIT && addedPoints > 0) return text;

  const topPoint = readablePoints[0] ?? "대상 조건 확인";
  const minimalTemplate = (
    safeLead: string,
    safeTitle: string,
    safeSummary: string,
    safePoint: string,
  ) =>
    `${safeLead}\n\n원문\n${safeTitle}\n\n핵심 요약\n${safeSummary}\n\n확인 포인트\n• ${safePoint}\n\n자세히 보기\n${url}`;
  const fixedWithoutVariableText =
    "\n\n원문\n\n핵심 요약\n\n확인 포인트\n• \n\n자세히 보기\n".length + url.length;
  const safeLead = ellipsize(lead, 72);
  const safePoint = ellipsize(topPoint, 54);
  const minSummaryLength = 34;
  const titleBudget = Math.max(
    1,
    THREADS_TEXT_LIMIT - fixedWithoutVariableText - safeLead.length - safePoint.length - minSummaryLength,
  );
  const safeTitle = ellipsize(title, titleBudget);
  const summaryBudget = Math.max(
    0,
    THREADS_TEXT_LIMIT - minimalTemplate(safeLead, safeTitle, "", safePoint).length,
  );
  const safeSummary = ellipsize(summary, summaryBudget);
  const fallbackText = minimalTemplate(safeLead, safeTitle, safeSummary, safePoint);

  return fallbackText.length <= THREADS_TEXT_LIMIT
    ? fallbackText
    : `${ellipsize(lead, Math.max(1, THREADS_TEXT_LIMIT - tail.length - 2))}\n${tail}`.slice(0, THREADS_TEXT_LIMIT);
}

export async function dispatchBlogToSns(
  post: BlogPostShare,
  opts: { channels?: SnsChannel[] } = {},
): Promise<SnsDispatchResult[]> {
  const twitterUrl = buildBlogUrl(post.slug, "twitter", "link");
  const facebookUrl = buildBlogUrl(post.slug, "facebook", "link");
  const title = post.title;
  // 캡션 / 메시지 — 채널별 길이 제한. 단순 한국어 default.
  const desc = post.description?.slice(0, 100) ?? "";
  const tweetTitle = ellipsize(title, Math.max(1, 280 - twitterUrl.length - 2));
  const tweetText = `${tweetTitle}\n\n${twitterUrl}`.slice(0, 280);
  const fbMessage = `${title}\n\n${desc}`.slice(0, 500);
  const channelSet = new Set(opts.channels ?? ALL_CHANNELS);
  const leadPolicy = channelSet.has("threads") ? await loadSnsLeadPolicySnapshot() : null;
  const threadsText = buildThreadsText(post, {
    disabledLeadVariants: leadPolicy?.disabledLeadVariants ?? [],
  });

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
    tasks.push(publishFacebookPost({ message: fbMessage, link: facebookUrl }).then((r) => ({
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
