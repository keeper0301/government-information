// 정책 상세 "신청 실행 카드" 뷰 모델.
// 요약 4줄·단계·근거는 DB 에 있는 문장만 쓴다. 금액·서류는 만들지 않는다.

import { cleanDescription } from "@/lib/utils";
import { isDeepLink, sanitizeApplyUrl } from "@/lib/utils/apply-url";

export type ApplyRoute = "online" | "visit" | "phone";

export type ApplyActionInput = {
  title: string;
  target: string | null;
  region: string | null;
  district: string | null;
  source: string | null;
  sourceUrl: string | null;
  updatedAt: string | null;
  eligibility: string | null;
  benefits: string | null;
  loanAmount: string | null;
  interestRate: string | null;
  applyMethod: string | null;
  applyUrl: string | null;
  applyStart: string | null;
  applyEnd: string | null;
  contactInfo: string | null;
  description: string | null;
  detailedContent: string | null;
  selectionCriteria: string | null;
  requiredDocuments: string | null;
  repaymentPeriod: string | null;
  dday: number | null;
  isClosed: boolean;
};

export type ApplyStep = {
  text: string;
  href?: string;
  external?: boolean;
  tel?: boolean;
};

export type ApplyPhone = {
  label: string;
  display: string;
  tel: string;
};

export type ApplyPrimary =
  | { type: "apply"; href: string; label: "공식 사이트에서 신청하기" }
  | { type: "alimtalk"; label: "신청 방법 알림톡 받기" }
  | { type: "source"; href: string; label: "공식 공고 보기" };

export type ApplySecondary =
  | { type: "phone"; tel: string; label: "전화 문의"; display: string }
  | { type: "source"; href: string; label: "출처 보기" };

export type ApplyActionModel = {
  chips: string[];
  sourceLine: string;
  summary: {
    who: string;
    amount: string;
    when: { text: string; urgent: boolean };
    how: string;
  };
  route: ApplyRoute;
  steps: ApplyStep[];
  phone: ApplyPhone | null;
  trustSource: string;
  legalBasis: string | null;
  audience: "parent" | "self";
  primary: ApplyPrimary;
  secondary: ApplySecondary | null;
  contactAction: ApplySecondary | null;
  originalBody: string;
};

const MISSING_WHO = "공식 공고의 대상 조건";
const MISSING_AMOUNT = "공식 공고의 지원 내용";
const UNKNOWN_WHEN = "상시 또는 기관 확인";
const CONFIRM_STEP = "최종 조건은 공식 공고에서 한 번 더 확인하세요.";

const PHONE_RE = /(?:\(0\d{1,2}\)|0\d{1,2})[-\s.]?\d{3,4}[-\s.]?\d{4}|1[568]\d{2}[-\s.]?\d{4}/;

const PROXY_AUDIENCE = /노인|어르신|노년|고령|100세|영유아|아동|어린이|초등|중학생|고등학생|청소년|장애인|한부모/;
const SELF_AUDIENCE = /청년|대학생|직장|근로자|소상공인|자영업|신혼|구직|취업|창업|1인\s*가구/;

export function formatDotDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.replace(/-/g, ".");
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return formatted.replace(/-/g, ".");
}

export function extractContactPhone(
  contact: string | null | undefined,
  sourceName: string,
): ApplyPhone | null {
  const text = cleanDescription(contact || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const match = text.match(PHONE_RE);
  if (!match || match.index === undefined) return null;
  const display = match[0].replace(/[()]/g, "").replace(/\s+/g, "-").replace(/\.+/g, "-").replace(/-+/g, "-");
  const digits = display.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 11) return null;
  let label = text.slice(0, match.index).replace(/[\s:：·|\-–—/]+$/g, "").trim();
  if (label.length > 36) {
    const tail = label.slice(-36).trim();
    const space = tail.indexOf(" ");
    label = (space >= 0 ? tail.slice(space + 1) : tail).trim();
  }
  if (!label) label = sourceName;
  return { label, display, tel: `tel:${digits}` };
}

export function extractLegalBasis(...texts: Array<string | null | undefined>): string | null {
  const blob = texts.filter((value): value is string => Boolean(value && value.trim())).join("\n");
  if (!blob) return null;
  const patterns = [
    /「([^」]{2,40})」/g,
    /([가-힣][가-힣0-9·]{1,30}(?:조례|법률|시행령|시행규칙|훈령))/g,
  ];
  for (const pattern of patterns) {
    for (const match of blob.matchAll(pattern)) {
      const value = (match[1] || match[0]).replace(/\s+/g, " ").trim();
      if (value.length < 4 || value.length > 40) continue;
      if (!/(법|조례|시행령|시행규칙|훈령)/.test(value)) continue;
      return value;
    }
  }
  return null;
}

export function resolveAudience(text: string): "parent" | "self" {
  if (PROXY_AUDIENCE.test(text)) return "parent";
  if (SELF_AUDIENCE.test(text)) return "self";
  return "parent";
}

function sourceNameOf(source: string | null): string {
  const name = source?.trim();
  return name || "공식 기관";
}

function classifyRoute(input: {
  applyUrl: string | null;
  applyMethod: string | null;
  hasPhone: boolean;
  isClosed: boolean;
}): ApplyRoute {
  const method = input.applyMethod ?? "";
  const saysVisit = /방문|내방|창구|주민센터|행정복지센터|동\s*행정/.test(method);
  const saysPhone = /전화|유선|콜센터/.test(method);
  const hasApplyLink = Boolean(input.applyUrl && isDeepLink(input.applyUrl) && !input.isClosed);
  if (hasApplyLink && !saysVisit) return "online";
  if (saysVisit) return "visit";
  if (input.hasPhone && (saysPhone || !hasApplyLink)) return "phone";
  if (hasApplyLink) return "online";
  return "visit";
}

function splitMethod(method: string | null): string[] {
  const text = cleanDescription(method || "").trim();
  if (!text) return [];
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:\d+[\.\)]|[①②③④]|[-•])\s*/, "").trim())
    .filter(Boolean);
  if (lines.length >= 2) return lines.slice(0, 4);
  const sentences = text
    .split(/(?<=(?:다|요)\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 2);
  if (sentences.length >= 2) return sentences.slice(0, 4);
  return [text];
}

function buildWhen(input: ApplyActionInput): { text: string; urgent: boolean } {
  if (input.isClosed) {
    const end = formatDotDate(input.applyEnd);
    return { text: end ? `마감됨 · ${end}` : "마감됨", urgent: true };
  }
  if (input.dday !== null && input.dday <= 7) {
    return { text: `D-${input.dday}`, urgent: true };
  }
  const start = formatDotDate(input.applyStart);
  const end = formatDotDate(input.applyEnd);
  if (start && end) return { text: `${start} ~ ${end}`, urgent: false };
  if (end) return { text: `${end} 마감`, urgent: false };
  if (start) return { text: `${start}부터`, urgent: false };
  return { text: UNKNOWN_WHEN, urgent: false };
}

function firstLine(value: string | null | undefined): string {
  const text = cleanDescription(value || "").replace(/\s+/g, " ").trim();
  return text;
}

function buildAmount(input: ApplyActionInput): string {
  const benefit = firstLine(input.benefits);
  const loan = firstLine(input.loanAmount);
  const rate = firstLine(input.interestRate);
  const head = benefit || loan;
  if (!head && !rate) return MISSING_AMOUNT;
  if (head && rate && !head.includes(rate)) return `${head} · 금리 ${rate}`;
  return head || `금리 ${rate}`;
}

function buildHow(input: ApplyActionInput, route: ApplyRoute, sourceName: string): string {
  const method = cleanDescription(input.applyMethod || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean);
  if (method) return method;
  if (route === "online") return "공식 사이트에서 신청";
  if (route === "phone") return "전화 문의";
  return `가까운 ${sourceName} 방문`;
}

function buildSteps(input: {
  route: ApplyRoute;
  applyUrl: string | null;
  applyMethod: string | null;
  phone: ApplyPhone | null;
  sourceName: string;
}): ApplyStep[] {
  const methodSteps = splitMethod(input.applyMethod);
  const steps: ApplyStep[] = [];
  if (input.route === "online" && input.applyUrl) {
    steps.push({ text: "공식 사이트에서 신청하기", href: input.applyUrl, external: true });
  } else if (input.route === "phone" && input.phone) {
    steps.push({
      text: `${input.phone.label} ${input.phone.display}`.trim(),
      href: input.phone.tel,
      tel: true,
    });
  } else if (!methodSteps.some((line) => /방문|센터|창구/.test(line))) {
    steps.push({ text: `가까운 ${input.sourceName} 방문` });
  }

  for (const line of methodSteps) {
    if (steps.length >= 4) break;
    if (steps.some((step) => step.text === line)) continue;
    steps.push({ text: line });
  }
  if (steps.length < 2) steps.push({ text: CONFIRM_STEP });
  return steps.slice(0, 4);
}

function normalizeParagraph(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildOriginalBody(parts: Array<string | null | undefined>, covered: string[]): string {
  const paragraphs = parts
    .map((part) => cleanDescription(part || "").trim())
    .filter(Boolean)
    .flatMap((part) => part.split(/\n{2,}/))
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const coveredNorms = covered.map(normalizeParagraph).filter((value) => value.length >= 8);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const paragraph of paragraphs) {
    const norm = normalizeParagraph(paragraph);
    if (!norm || seen.has(norm)) continue;
    const duplicated = coveredNorms.some((coveredText) => {
      if (coveredText === norm) return true;
      if (norm.length < 20 || coveredText.length < 20) return false;
      return coveredText.includes(norm) || norm.includes(coveredText);
    });
    if (duplicated) continue;
    seen.add(norm);
    kept.push(paragraph);
  }
  return kept.join("\n\n");
}

function buildChips(input: ApplyActionInput): string[] {
  const chips: string[] = [];
  const target = input.target?.trim();
  if (target) chips.push(target);
  const region = input.region?.trim() || "";
  const district = input.district?.trim() || "";
  let place = "";
  if (region && district && !region.includes(district)) place = `${region} ${district}`;
  else place = region || district;
  if (place) chips.push(place);
  return chips;
}

export function buildApplyActionModel(input: ApplyActionInput): ApplyActionModel {
  const sourceName = sourceNameOf(input.source);
  const applyUrl = sanitizeApplyUrl(input.applyUrl);
  const sourceUrl = sanitizeApplyUrl(input.sourceUrl);
  const phone = extractContactPhone(input.contactInfo, sourceName);
  const route = classifyRoute({
    applyUrl,
    applyMethod: input.applyMethod,
    hasPhone: Boolean(phone),
    isClosed: input.isClosed,
  });
  const who = firstLine(input.eligibility) || firstLine(input.target) || MISSING_WHO;
  const amount = buildAmount(input);
  const when = buildWhen(input);
  const how = buildHow(input, route, sourceName);
  const steps = buildSteps({ route, applyUrl, applyMethod: input.applyMethod, phone, sourceName });
  const updated = formatDotDate(input.updatedAt);
  const sourceLine = updated
    ? `출처: ${sourceName} · 자료 갱신 ${updated}`
    : `출처: ${sourceName}`;
  const legalBasis = extractLegalBasis(
    input.selectionCriteria,
    input.description,
    input.detailedContent,
    input.title,
  );
  const audience = resolveAudience([input.target, input.title, input.eligibility].filter(Boolean).join(" "));

  const primary: ApplyPrimary = !input.isClosed && route === "online" && applyUrl
    ? { type: "apply", href: applyUrl, label: "공식 사이트에서 신청하기" }
    : input.isClosed && (sourceUrl || applyUrl)
      ? { type: "source", href: (sourceUrl || applyUrl) as string, label: "공식 공고 보기" }
      : { type: "alimtalk", label: "신청 방법 알림톡 받기" };

  const sourceHref = sourceUrl || applyUrl;
  let secondary: ApplySecondary | null = null;
  if (phone) {
    secondary = { type: "phone", tel: phone.tel, label: "전화 문의", display: `${phone.label} ${phone.display}`.trim() };
  } else if (sourceHref && !(primary.type === "source" && primary.href === sourceHref)) {
    secondary = { type: "source", href: sourceHref, label: "출처 보기" };
  }

  const contactAction: ApplySecondary | null = phone
    ? { type: "phone", tel: phone.tel, label: "전화 문의", display: `${phone.label} ${phone.display}`.trim() }
    : sourceHref
      ? { type: "source", href: sourceHref, label: "출처 보기" }
      : null;

  const originalBody = buildOriginalBody(
    [
      input.description,
      input.detailedContent,
      input.selectionCriteria,
      input.requiredDocuments,
      input.repaymentPeriod ? `상환 조건: ${input.repaymentPeriod}` : null,
      input.contactInfo,
      input.applyMethod,
    ],
    [who, amount, how, when.text, ...steps.map((step) => step.text), phone?.display || ""],
  );

  return {
    chips: buildChips(input),
    sourceLine,
    summary: { who, amount, when, how },
    route,
    steps,
    phone,
    trustSource: sourceName,
    legalBasis,
    audience,
    primary,
    secondary,
    contactAction,
    originalBody,
  };
}
