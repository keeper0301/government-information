import { callLLM, parseJSONResponse } from "@/lib/llm/text";
import { publishThreadsPost, type SnsResult } from "./threads";

export type ThreadsCandidateInput = {
  title: string;
  url?: string | null;
  region?: string | null;
  applyEnd?: string | null;
};

export type ThreadsCandidateDraft = {
  title: string;
  keyword: string;
  text: string;
  source: "llm" | "fallback";
  validation: ThreadsCandidateValidation;
};

export type ThreadsCandidateValidation = {
  ok: boolean;
  reasons: string[];
  length: number;
  hasKeepiooMention: boolean;
  hasDirectUrl: boolean;
  hasKeyword: boolean;
};

export type ThreadsCandidatePublishResult = ThreadsCandidateDraft & {
  published: boolean;
  result?: SnsResult;
};

const THREADS_LIMIT = 500;
const BANNED_MACRO_PHRASES = [
  "급할 때 빌릴 돈, 비싸게 쓰지 마",
  "대상 맞으면 그냥 넘길 일이 아니야",
  "근데 이게 진짜 아까운 이유는 따로 있어",
  "알아서 챙겨주지 않아",
  "대상·기간·서류부터 확인해",
  "이번 주 인기 정책",
];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function ellipsize(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

export function normalizeThreadsCandidateKeyword(title: string): string {
  const cleaned = normalizeText(title)
    .replace(/^20\d{2}년\s*/, "")
    .replace(/\s*[|｜].*$/, "")
    .replace(/[:：].*$/, "")
    .replace(/\b\d[\d,.]*(?:만|억)?원\b/g, "")
    .trim();
  const specific = [
    "호주 통상촉진단",
    "라이브커머스",
    "홈쇼핑",
    "디지털전환",
    "공정 혁신",
    "판로 개척",
    "방송 송출비",
    "수출",
    "제조기업",
  ];
  const hit = specific.find((keyword) => cleaned.includes(keyword));
  if (hit) return hit.replace(/\s+/g, "");
  const stop = /^(경기|경기도|중소기업|중견|제조기업|추가지원|지원|혜택|사업|모집|공고|신청|기업)$/;
  const token = cleaned
    .split(/\s+/)
    .map((part) => part.replace(/[()\[\],.]/g, ""))
    .find((part) => part && !stop.test(part));
  return ellipsize((token || "정책").replace(/\s+/g, ""), 14).replace(/…$/, "");
}

function classifyAngle(title: string): "export" | "commerce" | "digital" | "general" {
  if (/호주|수출|해외|판로|통상/.test(title)) return "export";
  if (/홈쇼핑|라이브커머스|송출|판매/.test(title)) return "commerce";
  if (/디지털전환|DX|공정|실증|스마트/.test(title)) return "digital";
  return "general";
}

export function buildFallbackCandidateThreadsText(candidate: ThreadsCandidateInput): string {
  const title = normalizeText(candidate.title);
  const keyword = normalizeThreadsCandidateKeyword(title);
  const angle = classifyAngle(title);
  const region = candidate.region || (title.includes("경기") ? "경기" : null);
  const leadByAngle: Record<ReturnType<typeof classifyAngle>, string> = {
    export: "해외 판로 열어야 하는 경기 중소기업이면 이 공고는 그냥 지나치기 아깝습니다.",
    commerce: "제품은 있는데 판매 채널이 약한 경기 중소기업이면 방송 송출비부터 확인해보세요.",
    digital: "공정 개선이 숙제인 제조기업이면 디지털전환 실증 지원을 먼저 봐야 합니다.",
    general: "조건 맞는 기업이면 사업비 쓰기 전에 이 지원부터 확인해보세요.",
  };
  const fact = candidate.applyEnd
    ? `마감은 ${candidate.applyEnd} 기준으로 확인해야 합니다.`
    : "모집 기간과 대상 조건은 공고 원문 기준으로 확인해야 합니다.";
  const regionLine = region ? `${region} 기업 대상 공고입니다.` : "지역·업종 조건을 먼저 확인해야 합니다.";
  return [
    leadByAngle[angle],
    "",
    regionLine,
    fact,
    "",
    `자세한 조건은 @keepioo_official 카드뉴스로 정리해둘게요. 댓글에 **${keyword}** 남겨두면 다시 찾기 쉽습니다.`,
  ].join("\n").slice(0, THREADS_LIMIT);
}

export function validateCandidateThreadsText(text: string, candidate: ThreadsCandidateInput): ThreadsCandidateValidation {
  const keyword = normalizeThreadsCandidateKeyword(candidate.title);
  const reasons: string[] = [];
  const hasKeepiooMention = text.includes("@keepioo_official");
  const hasDirectUrl = /https?:\/\//i.test(text);
  const hasKeyword = text.replace(/\s+/g, "").includes(keyword.replace(/\s+/g, ""));
  if (text.length < 60) reasons.push("too_short");
  if (text.length > THREADS_LIMIT) reasons.push("too_long");
  if (!hasKeepiooMention) reasons.push("missing_keepioo_mention");
  if (hasDirectUrl) reasons.push("direct_url_not_allowed");
  if (!hasKeyword) reasons.push("missing_comment_keyword");
  for (const phrase of BANNED_MACRO_PHRASES) {
    if (text.includes(phrase)) reasons.push(`macro_phrase:${phrase}`);
  }
  return {
    ok: reasons.length === 0,
    reasons,
    length: text.length,
    hasKeepiooMention,
    hasDirectUrl,
    hasKeyword,
  };
}

async function buildLlmCandidateThreadsText(candidate: ThreadsCandidateInput): Promise<string> {
  const keyword = normalizeThreadsCandidateKeyword(candidate.title);
  const prompt = `너는 keepioo_official Threads 편집자다. 아래 정책 후보 1개를 보고 한국어 Threads 글 1개를 작성한다.

룰:
- 500자 이하.
- URL 넣지 마라.
- @keepioo_official 언급 1회.
- 댓글 키워드 "${keyword}" 포함.
- 과장 금지. 지원 확정처럼 말하지 말고 조건 확인을 말한다.
- 하드코딩 매크로처럼 보이는 반복 문장 금지.
- 자연스러운 사람 말투. 짧은 줄바꿈.

후보:
${JSON.stringify(candidate, null, 2)}

JSON만 출력: {"text":"..."}`;
  const raw = await callLLM({ prompt, jsonMode: true, maxTokens: 260, timeoutMs: 15_000 });
  const parsed = parseJSONResponse<{ text?: unknown }>(raw);
  if (typeof parsed.text !== "string" || !parsed.text.trim()) {
    throw new Error("llm_text_missing");
  }
  return parsed.text.trim();
}

export async function buildThreadsCandidateDraft(candidate: ThreadsCandidateInput): Promise<ThreadsCandidateDraft> {
  const keyword = normalizeThreadsCandidateKeyword(candidate.title);
  try {
    const llmText = await buildLlmCandidateThreadsText(candidate);
    const validation = validateCandidateThreadsText(llmText, candidate);
    if (validation.ok) {
      return { title: candidate.title, keyword, text: llmText, source: "llm", validation };
    }
  } catch {
    // deterministic fallback below — reliability path, not the preferred voice.
  }
  const text = buildFallbackCandidateThreadsText(candidate);
  return {
    title: candidate.title,
    keyword,
    text,
    source: "fallback",
    validation: validateCandidateThreadsText(text, candidate),
  };
}

export async function publishApprovedThreadsCandidates(
  candidates: ThreadsCandidateInput[],
  opts: { dryRun?: boolean; approved?: boolean } = {},
): Promise<ThreadsCandidatePublishResult[]> {
  const limited = candidates.slice(0, 5);
  const drafts = await Promise.all(limited.map((candidate) => buildThreadsCandidateDraft(candidate)));
  if (opts.dryRun !== false || opts.approved !== true) {
    return drafts.map((draft) => ({ ...draft, published: false }));
  }
  if (process.env.THREADS_CANDIDATE_PUBLISH_ENABLED !== "true") {
    return drafts.map((draft) => ({ ...draft, published: false, result: { ok: false, reason: "candidate_publish_gate_disabled" } }));
  }
  const results: ThreadsCandidatePublishResult[] = [];
  for (const draft of drafts) {
    if (!draft.validation.ok) {
      results.push({ ...draft, published: false, result: { ok: false, reason: `validation_failed:${draft.validation.reasons.join(",")}` } });
      continue;
    }
    const result = await publishThreadsPost({ text: draft.text });
    results.push({ ...draft, published: result.ok, result });
  }
  return results;
}
