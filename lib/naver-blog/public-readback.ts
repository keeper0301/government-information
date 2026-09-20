export type NaverPublicReadbackExpectation = {
  naverUrl: string;
  title: string;
  corePhrase: string;
  queueId: string;
  contentId: string;
  expectedLogNo?: string;
};

export type NaverPublicReadbackResult = {
  ok: boolean;
  publicUrl: string;
  logNo: string;
  checks: {
    title: boolean;
    corePhrase: boolean;
    exactCtaIdentity: boolean;
    logNo: boolean;
  };
  failures: string[];
};

function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/g, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function normalizePublicReadbackText(value: string): string {
  return decodeHtml(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseNaverPublicIdentity(value: string): { blogId: string; logNo: string; publicUrl: string } {
  const parsed = new URL(value);
  if (!/(^|\.)blog\.naver\.com$/i.test(parsed.hostname)) throw new Error("invalid_naver_public_host");
  const pathMatch = parsed.pathname.match(/^\/([^/?#]+)\/(\d{9,})\/?$/);
  const queryLogNo = parsed.searchParams.get("logNo");
  const queryBlogId = parsed.searchParams.get("blogId");
  const blogId = pathMatch?.[1] ?? queryBlogId ?? "";
  const logNo = pathMatch?.[2] ?? queryLogNo ?? "";
  if (!/^[A-Za-z0-9_-]+$/.test(blogId) || !/^\d{9,}$/.test(logNo)) {
    throw new Error("invalid_naver_public_identity");
  }
  return { blogId, logNo, publicUrl: `https://m.blog.naver.com/${blogId}/${logNo}` };
}

function hasExactCtaIdentity(html: string, queueId: string, contentId: string): boolean {
  const decoded = decodeHtml(html).replace(/\\\//g, "/");
  const candidates = decoded.match(/https:\/\/www\.keepioo\.com\/[A-Za-z0-9%_./~?&=+\-]+/g) ?? [];
  return candidates.some((candidate) => {
    try {
      const url = new URL(candidate.replace(/[)'"<>]+$/g, ""));
      return url.searchParams.get("utm_id") === queueId
        && url.searchParams.get("utm_content") === contentId;
    } catch {
      return false;
    }
  });
}

export function verifyNaverPublicPostHtml(
  html: string,
  expectation: NaverPublicReadbackExpectation,
): NaverPublicReadbackResult {
  const identity = parseNaverPublicIdentity(expectation.naverUrl);
  const normalized = normalizePublicReadbackText(html);
  const expectedTitle = normalizePublicReadbackText(expectation.title);
  const expectedCorePhrase = normalizePublicReadbackText(expectation.corePhrase);
  if (expectedTitle.length < 4) throw new Error("readback_title_too_short");
  if (expectedCorePhrase.length < 8) throw new Error("readback_core_phrase_required");

  const checks = {
    title: normalized.includes(expectedTitle),
    corePhrase: normalized.includes(expectedCorePhrase),
    exactCtaIdentity: hasExactCtaIdentity(html, expectation.queueId, expectation.contentId),
    logNo: !expectation.expectedLogNo || identity.logNo === expectation.expectedLogNo,
  };
  const failures = Object.entries(checks)
    .filter(([, matched]) => !matched)
    .map(([name]) => name);
  return { ok: failures.length === 0, publicUrl: identity.publicUrl, logNo: identity.logNo, checks, failures };
}

export async function fetchAndVerifyNaverPublicPost(
  expectation: NaverPublicReadbackExpectation,
  fetchImpl: typeof fetch = fetch,
): Promise<NaverPublicReadbackResult> {
  const identity = parseNaverPublicIdentity(expectation.naverUrl);
  const response = await fetchImpl(identity.publicUrl, {
    cache: "no-store",
    headers: { "User-Agent": "keepioo-naver-readback/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`naver_public_readback_http_${response.status}`);
  const html = await response.text();
  const result = verifyNaverPublicPostHtml(html, { ...expectation, naverUrl: identity.publicUrl });
  if (!result.ok) throw new Error(`naver_public_readback_mismatch:${result.failures.join(",")}`);
  return result;
}
