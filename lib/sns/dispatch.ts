// ============================================================
// C1 — SNS 3종 통합 dispatch (Twitter·Facebook·Threads).
// ============================================================
// blog post 1건 받아 3 채널 publish (env 설정된 것만 실제 발송).
// 결과는 채널별 ok/reason 객체 배열. partial 실패 허용.
//
// 인스타는 별도 cron (/api/cron/instagram-publish) 가 DB-based OAuth token + carousel
// 발행으로 처리. dispatch 에 포함 X (2026-05-14 review 정리).

import {
  CHALLENGER_LEAD_TRAFFIC_PCT,
  CHALLENGER_LEAD_VARIANTS,
  DEFAULT_ACTIVE_LEAD_VARIANTS,
  LEAD_VARIANTS,
  type SnsLeadVariant,
} from "@/lib/sns-control-tower/lead-policy";
import { callLLM, parseJSONResponse } from "@/lib/llm/text";
import { validateCaption } from "@/lib/validate-caption";
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
  const deadlineFirst = `${subject} 마감·대상 조건부터 확인하세요. 늦으면 신청 기회가 사라질 수 있습니다.`;
  const benefitFirst = `${subject} 받을 수 있는 혜택이 있는지 먼저 보세요. 금액·조건·신청 방법을 짧게 정리했습니다.`;
  const officialCheck = `${subject} 공식 기준으로 확인하세요. 대상 여부와 준비할 일을 한 번에 훑어볼 수 있습니다.`;
  return [direct, lossAvoidance, checklist, deadlineFirst, benefitFirst, officialCheck][variant] ?? direct;
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

function normalizePolicyKeyword(title: string): string {
  const cleaned = normalizeShareText(title)
    .replace(/^20\d{2}년\s*/, "")
    .replace(/[:：].*$/, "")
    .replace(/\s+(가이드|확인|총정리|정리|신청 방법|지원사업|사업|계획)$/g, "")
    .trim();
  const specific = [
    "땡겨요",
    "혼디론",
    "노란우산",
    "품질보증조달물품",
    "원산지인증수출자",
    "탄소저감시설지원자금",
    "주거 청결서비스",
    "신기술 육성자금",
    "기술창업 특례보증",
    "자동차세",
    "기초연금",
    "청년 월세",
    "청년월세",
    "전세자금",
    "특례보증",
    "출산장려금",
    "학자금대출",
    "주거급여",
  ];
  const specificHit = specific.find((keyword) => cleaned.includes(keyword));
  if (specificHit) return ellipsize(specificHit.replace(/\s+/g, ""), 14).replace(/…$/, "");
  const tokens = cleaned
    .split(/\s+/)
    .map((token) => token.replace(/[,:：]/g, ""))
    .filter(
      (token) =>
        token.length > 0
        && !/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|춘천|여주|울진|안양|시|군|구)$/.test(token)
        && !/^(소상공인|중소기업|사업자금|지원|지원사업|가이드|확인|신청|안내|대상|최대|계획)$/.test(token)
        && !/^\d[\d,.]*(?:만|억)?원?$/.test(token),
    );
  const meaningful = tokens.find((token) => /론|보증|자금|공제|연금|월세|이자|장려금|서비스|인증|조달|대출/.test(token)) ?? tokens[0];
  return ellipsize(meaningful || "신청", 14).replace(/…$/, "");
}

function compactPolicySubject(title: string): string {
  return ellipsize(
    normalizeShareText(title)
      .replace(/^20\d{2}년\s*/, "")
      .replace(/\s+가이드$/, "")
      .replace(/\s+확인$/, ""),
    34,
  );
}

function buildPunchBenefitLine(title: string, summary: string): string {
  const amount = title.match(/(?:최대\s*)?\d[\d,.]*(?:만|억)?\s*원/)?.[0]
    ?? summary.match(/(?:최대\s*)?\d[\d,.]*(?:만|억)?\s*원/)?.[0];
  if (amount) return `조건 맞으면 ${amount}까지 받을 수 있어.`;
  if (/대출|자금|보증|융자/.test(title)) return "조건 맞으면 자금 막힐 때 숨통 트일 수 있어.";
  if (/세금|공제|환급|이자/.test(title)) return "모르면 그대로 더 내고, 알면 줄일 수 있어.";
  if (/모집|참여|선정/.test(title)) return "대상 맞으면 지원 기회가 바로 열려.";
  return ellipsize(summary, 42);
}

function buildPunchUrgencyLine(title: string): string {
  if (/마감|접수|신청|모집/.test(title)) return "마감 지나면 그냥 끝이야.";
  if (/대출|자금|보증|융자/.test(title)) return "자금 필요할 때 모르면 비싼 돈부터 쓰게 돼.";
  if (/세금|공제|환급|이자/.test(title)) return "늦게 알면 줄일 수 있는 돈도 그냥 새.";
  return "몰라서 지나가면 받을 돈도 못 받아.";
}

type KeeperPunchTopicKind = "money" | "tax" | "deadline" | "local" | "welfare" | "general";

function classifyKeeperPunchTopic(title: string): KeeperPunchTopicKind {
  if (/세금|공제|환급|이자/.test(title)) return "tax";
  if (/대출|자금|보증|융자/.test(title)) return "money";
  if (/마감|접수|신청|모집/.test(title)) return "deadline";
  if (detectRegion(title)) return "local";
  if (/복지|연금|월세|장려금|수당|급여|출산|육아|장애인|어르신|노인/.test(title)) return "welfare";
  return "general";
}

function keeperPunchCta(keyword: string, variant: number): string {
  const ctas = [
    `댓글에 **${keyword}** 남겨줘.`,
    `필요하면 댓글에 **${keyword}**만 적어둬.`,
    `헷갈리면 댓글에 **${keyword}** 이렇게 남겨.`,
    `나중에 찾을 거면 댓글에 **${keyword}** 남겨놔.`,
  ];
  return ctas[variant % ctas.length];
}

function buildKeepiooMention(variant: number): string {
  const mentions = [
    "@keepioo_official 인스타에 카드뉴스로 정리해뒀어.",
    "자세한 조건은 @keepioo_official 카드뉴스에 따로 빼뒀어.",
    "길게 읽기 전에 @keepioo_official 카드뉴스로 먼저 훑어봐도 돼.",
    "신청 전 체크할 건 @keepioo_official 쪽에 보기 쉽게 정리해뒀어.",
  ];
  return mentions[variant % mentions.length];
}

function buildKeeperPunchTemplates(input: {
  title: string;
  subject: string;
  summary: string;
  benefit: string;
  urgency: string;
  keyword: string;
  kind: KeeperPunchTopicKind;
}): string[][] {
  const { title, subject, summary, benefit, urgency, keyword, kind } = input;
  const moneyHook = kind === "money"
    ? "급한 돈일수록\n비싸게 빌리기 전에 볼 게 있어."
    : "받을 수 있는 건\n먼저 걸러봐야 해.";
  const reader = detectAudience(title) ?? "해당될 수 있다면";
  return [
    [
      kind === "money" ? "돈 필요한 공고는\n금액보다 조건부터 봐야 해." : kind === "tax" ? "세금 쪽은\n늦게 알수록 손해야." : "지원 공고는\n나한테 맞는지만 먼저 보면 돼.",
      "",
      subject,
      benefit,
      "",
      urgency,
      "",
      "읽는 순서만 바꿔도 헛걸음 줄어.",
      "대상 → 기간 → 신청처.",
      "",
      buildKeepiooMention(0),
      keeperPunchCta(keyword, 0),
    ],
    [
      moneyHook,
      "",
      `${subject}.`,
      benefit,
      "",
      "이런 건 금액만 보면 안 돼.",
      "우리 쪽이 대상인지,",
      "접수 기간이 남았는지,",
      "서류가 감당되는지부터 봐야 해.",
      "",
      buildKeepiooMention(1),
      keeperPunchCta(keyword, 1),
    ],
    [
      `${reader}\n이 공고는 저장해둘 만해.`,
      "",
      subject,
      benefit,
      "",
      urgency,
      "그래서 제목보다 먼저 볼 건 조건이야.",
      "",
      "대상",
      "기간",
      "신청처",
      "이 세 개만 먼저 걸러도 헛걸음 줄어.",
      "",
      buildKeepiooMention(2),
      keeperPunchCta(keyword, 2),
    ],
    [
      "메모용.",
      "",
      subject,
      "",
      summary || benefit,
      "",
      "확인 순서",
      "1. 내가 대상인지",
      "2. 아직 접수 가능한지",
      "3. 공식 신청처가 맞는지",
      "",
      "맞으면 그때 자세히 읽어도 늦지 않아.",
      buildKeepiooMention(3),
      keeperPunchCta(keyword, 3),
    ],
    [
      kind === "local" ? "지역 공고는\n전국 지원금보다 더 자주 놓쳐." : "공고문 처음부터 다 읽으면 피곤해.",
      "",
      `${subject}은 일단 이렇게 보면 돼.`,
      "",
      benefit,
      urgency,
      "",
      "해당 없으면 넘기고,",
      "대상 맞으면 신청처까지 확인.",
      "",
      buildKeepiooMention(1),
      keeperPunchCta(keyword, 2),
    ],
  ];
}

function fitKeeperPunchText(templates: string[][]): string {
  for (const lines of templates) {
    const text = lines.join("\n");
    if (text.length <= THREADS_TEXT_LIMIT) return text;
  }
  return templates[templates.length - 1].join("\n").slice(0, THREADS_TEXT_LIMIT);
}

function buildKeeperPunchThreadsText(post: BlogPostShare): string {
  const title = normalizeShareText(post.title);
  const fallback =
    "대상 조건, 신청 시점, 준비할 내용을 먼저 확인하세요. 해당되는 사람은 마감과 기준이 달라질 수 있어 원문 확인이 필요합니다.";
  const sentences = splitKoreanSentences(post.description?.trim() ? post.description : fallback);
  const summary = normalizeShareText(sentences[0] ?? fallback);
  const subject = compactPolicySubject(title);
  const keyword = normalizePolicyKeyword(title);
  const benefit = buildPunchBenefitLine(title, summary);
  const urgency = buildPunchUrgencyLine(title);
  const kind = classifyKeeperPunchTopic(title);
  const templates = buildKeeperPunchTemplates({ title, subject, summary, benefit, urgency, keyword, kind });
  const variant = stableBucket(`${post.slug}:${title}:keeper-punch-editorial-v2`, templates.length);
  return fitKeeperPunchText([...templates.slice(variant), ...templates.slice(0, variant)]);
}

function selectLeadVariant(
  seed: string,
  disabledLeadVariants: SnsLeadVariant[] = LEAD_VARIANTS.filter((lead) => !DEFAULT_ACTIVE_LEAD_VARIANTS.includes(lead)),
  challengerTrafficPct: number = CHALLENGER_LEAD_TRAFFIC_PCT,
): number {
  const disabled = new Set(disabledLeadVariants);
  const enabled = LEAD_VARIANTS.filter((lead) => !disabled.has(lead));
  const coreEnabled = enabled.filter((lead) => DEFAULT_ACTIVE_LEAD_VARIANTS.includes(lead));
  const challengerEnabled = enabled.filter((lead) => CHALLENGER_LEAD_VARIANTS.includes(lead));
  const safeChallengerTrafficPct = Math.max(0, Math.min(50, Math.floor(challengerTrafficPct)));
  const useChallenger =
    challengerEnabled.length > 0 &&
    stableBucket(`${seed}:challenger-gate`, 100) < safeChallengerTrafficPct;
  const candidates = useChallenger
    ? challengerEnabled
    : coreEnabled.length > 0
      ? coreEnabled
      : enabled.length > 0
        ? enabled
        : DEFAULT_ACTIVE_LEAD_VARIANTS;
  const selected = candidates[stableBucket(seed, candidates.length)];
  return Number(selected.replace("lead_", ""));
}

type ThreadsEditorialLLMResponse = {
  text?: unknown;
};

const THREADS_EDITORIAL_BANNED_PATTERNS = [
  /급할 때 빌릴 돈, 비싸게 쓰지 마/,
  /대상 맞으면 그냥 넘길 일이 아니야/,
  /근데 이게 진짜 아까운 이유는 따로 있어/,
  /알아서 챙겨주지 않아/,
  /대상·기간·서류부터 확인해/,
  /제가 말하고 싶은 건/,
  /먼저 볼 건 딱/,
  /여러분/,
];

function cleanThreadsEditorialText(value: string): string {
  return value
    .replace(/^```(?:json|text)?\s*/i, "")
    .replace(/```$/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function isSafeThreadsEditorialText(text: string, keyword: string): boolean {
  if (text.length < 120 || text.length > THREADS_TEXT_LIMIT) return false;
  if (!text.includes("@keepioo_official")) return false;
  if (!text.includes(keyword)) return false;
  if (/https?:\/\//.test(text)) return false;
  if (THREADS_EDITORIAL_BANNED_PATTERNS.some((pattern) => pattern.test(text))) return false;
  return validateCaption(text, {
    source: "threads-editorial",
    requireSubstance: true,
    warnOnly: true,
  }).ok;
}

function buildThreadsEditorialPrompt(post: BlogPostShare, fallbackText: string): string {
  const title = normalizeShareText(post.title);
  const keyword = normalizePolicyKeyword(title);
  const description = normalizeShareText(post.description ?? "");
  return `너는 keeper.punch Threads 편집자다. 아래 정책/글 1건을 보고 매번 새로 판단해서 한국 Threads 글 1개를 작성해라.

규칙:
- 500자 이하, 한국어, 한 게시물로 완결.
- 정책명만 바꾸는 템플릿 금지. 이전 글과 같은 첫줄/중간 구조/CTA cadence 반복 금지.
- 아래 금지 표현은 쓰지 마라: "급할 때 빌릴 돈, 비싸게 쓰지 마", "대상 맞으면 그냥 넘길 일이 아니야", "근데 이게 진짜 아까운 이유는 따로 있어", "알아서 챙겨주지 않아", "대상·기간·서류부터 확인해", "여러분", "제가 말하고 싶은 건", "먼저 볼 건 딱".
- 매번 내부적으로 reader, why now, one job, shape를 새로 고르고 그 판단을 글 표면에 반영해라.
- 혜택 확정/보장처럼 말하지 마라. 조건·마감·공식 신청처 확인 필요성을 자연스럽게 넣어라.
- URL은 넣지 마라.
- @keepioo_official 언급 1회 포함.
- 댓글 키워드 "${keyword}"를 자연스럽게 포함.
- 출력은 JSON만: {"text":"..."}

소스:
제목: ${title}
요약: ${description || "대상 조건, 신청 시점, 준비할 내용을 확인해야 하는 정책 글"}
댓글 키워드: ${keyword}

참고용 fallback(복붙 금지, 정보만 참고):
${fallbackText}`;
}

async function buildKeeperPunchThreadsTextEditorial(post: BlogPostShare): Promise<string> {
  const fallbackText = buildKeeperPunchThreadsText(post);
  const title = normalizeShareText(post.title);
  const keyword = normalizePolicyKeyword(title);
  try {
    const raw = await callLLM({
      prompt: buildThreadsEditorialPrompt(post, fallbackText),
      jsonMode: true,
      maxTokens: 500,
      timeoutMs: 15000,
    });
    const parsed = parseJSONResponse<ThreadsEditorialLLMResponse>(raw);
    const text = typeof parsed.text === "string" ? cleanThreadsEditorialText(parsed.text) : "";
    return isSafeThreadsEditorialText(text, keyword) ? text : fallbackText;
  } catch {
    return fallbackText;
  }
}

export function buildThreadsText(
  post: BlogPostShare,
  opts: { disabledLeadVariants?: SnsLeadVariant[]; includeChallengerLeads?: boolean; challengerTrafficPct?: number } = {},
): string {
  if (!opts.includeChallengerLeads) return buildKeeperPunchThreadsText(post);
  const title = normalizeShareText(post.title);
  const defaultDisabled = LEAD_VARIANTS.filter((lead) => !DEFAULT_ACTIVE_LEAD_VARIANTS.includes(lead));
  const disabledLeadVariants = opts.includeChallengerLeads
    ? (opts.disabledLeadVariants ?? [])
    : (opts.disabledLeadVariants ?? defaultDisabled);
  const variant = selectLeadVariant(`${post.slug}:${title}`, disabledLeadVariants, opts.challengerTrafficPct);
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

  if (fallbackText.length <= THREADS_TEXT_LIMIT) return fallbackText;

  // URL이 긴 한글 slug일 때도 최후 fallback이 "짧은 첫줄+링크"로 퇴화하면
  // requireSubstance 검증(120자/3줄)을 다시 밟는다. 제목은 버리고, 본문 정보량과 URL을 우선 보존한다.
  const compactPoint = ellipsize(safePoint || "대상 조건 확인", 32);
  const compactSecondPoint = "신청 방법·마감 확인";
  const compactLead = ellipsize(lead, 58);
  const compactFixed = `${compactLead}\n\n핵심 요약\n\n확인 포인트\n• ${compactPoint}\n• ${compactSecondPoint}\n\n자세히 보기\n${url}`;
  const compactSummaryBudget = Math.max(0, THREADS_TEXT_LIMIT - compactFixed.length);
  const compactSummarySource = normalizeShareText(`${summary} ${fallback}`);
  const compactSummary = ellipsize(compactSummarySource, compactSummaryBudget);
  const compactFallback = `${compactLead}\n\n핵심 요약\n${compactSummary}\n\n확인 포인트\n• ${compactPoint}\n• ${compactSecondPoint}\n\n자세히 보기\n${url}`;
  if (compactFallback.length <= THREADS_TEXT_LIMIT) return compactFallback;

  return `${ellipsize(compactLead, Math.max(1, THREADS_TEXT_LIMIT - tail.length - 2))}\n${tail}`.slice(0, THREADS_TEXT_LIMIT);
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
  const threadsText = channelSet.has("threads")
    ? await buildKeeperPunchThreadsTextEditorial(post)
    : "";

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
