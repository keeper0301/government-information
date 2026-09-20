export type NaverRenderedPayloadIssue =
  | "duplicate_heading"
  | "duplicate_faq"
  | "placeholder_period"
  | "placeholder_route"
  | "sentence_join_error"
  | "naked_long_url";

export type NaverRenderedPayloadQa = {
  ok: boolean;
  issues: NaverRenderedPayloadIssue[];
  evidence: string[];
};

function decode(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function plainText(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function addIssue(
  issues: NaverRenderedPayloadIssue[],
  evidence: string[],
  issue: NaverRenderedPayloadIssue,
  detail: string,
) {
  if (!issues.includes(issue)) issues.push(issue);
  evidence.push(`${issue}:${detail}`);
}

export function assessNaverRenderedPayload(bodyHtml: string): NaverRenderedPayloadQa {
  const issues: NaverRenderedPayloadIssue[] = [];
  const evidence: string[] = [];
  const text = plainText(bodyHtml);

  const headingTexts = [...bodyHtml.matchAll(/<p\b[^>]*font-weight\s*:\s*(?:700|800)[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => plainText(match[1]).replace(/^[📍▶✅•\s]+/, "").trim())
    .filter((value) => value.length >= 3 && !/^[━─—_=*·•\s]+$/.test(value));
  const headingCounts = new Map<string, number>();
  for (const heading of headingTexts) headingCounts.set(heading, (headingCounts.get(heading) ?? 0) + 1);
  for (const [heading, count] of headingCounts) {
    if (count > 1) addIssue(issues, evidence, "duplicate_heading", `${heading}:${count}`);
  }

  const faqCount = (text.match(/자주\s*묻는\s*질문/g) ?? []).length;
  if (faqCount > 1) addIssue(issues, evidence, "duplicate_faq", String(faqCount));
  if (/공식\s*(?:페이지|공고)의?\s*신청\s*기간\s*또는\s*상시\s*여부\s*확인/.test(text)) {
    addIssue(issues, evidence, "placeholder_period", "신청 기간 또는 상시 여부 확인");
  }
  if (/공식\s*신청\s*(?:페이지|경로)\s*또는\s*담당\s*기관\s*확인/.test(text)) {
    addIssue(issues, evidence, "placeholder_route", "공식 신청 페이지 또는 담당 기관 확인");
  }
  if (/(?:요|다|니다)\.(?:을|를|이|가|은|는)\b|보험료을|지원를|혜택를|금액를/.test(text)) {
    addIssue(issues, evidence, "sentence_join_error", text.match(/.{0,24}(?:(?:요|다|니다)\.(?:을|를|이|가|은|는)|보험료을|지원를|혜택를|금액를).{0,24}/)?.[0] ?? "particle_join");
  }

  const withoutAnchors = bodyHtml.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, " ");
  const nakedUrl = plainText(withoutAnchors).match(/https?:\/\/\S{60,}/)?.[0];
  if (nakedUrl) addIssue(issues, evidence, "naked_long_url", nakedUrl.slice(0, 120));

  return { ok: issues.length === 0, issues, evidence };
}

export function assertNaverRenderedPayload(bodyHtml: string): void {
  const qa = assessNaverRenderedPayload(bodyHtml);
  if (!qa.ok) throw new Error(`naver_rendered_payload_qa_failed:${qa.evidence.join("|")}`);
}
