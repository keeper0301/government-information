// ============================================================
// 광역 보도자료 자동 confirm — apply_url fallback chain
// ============================================================
// LLM 이 보수적으로 apply_url=null 응답하는 경우 (97% 사례) 자동 confirm 가능하도록
// 4 layer fallback 으로 url 을 채운다. 안전을 위해 정부 도메인 화이트리스트 강제.
//
// 입력: ClassifyResult.apply_url + ClassifyResult.body_urls + 본문 + ministry + sourceUrl
// 출력: apply_url (또는 null — 4 layer 모두 실패 시)
//
// 위험 가드:
//   - 화이트리스트 (*.go.kr / *.gov.kr / *.or.kr / *.re.kr) 외 url 은 자동 채우지 않음
//   - 광역 매핑은 도청 공식 도메인만 (province-default-urls)
//   - source_url 은 keepioo 자체 도메인이라 안전 (사용자가 보도자료 출처 확인)
// ============================================================

import { PROVINCE_DEFAULT_URLS } from "./province-default-urls";

// 정부·공공기관 도메인 화이트리스트 (suffix 매칭)
// .go.kr  : 정부 부처·시도청·시군청 (대부분 광역 보도자료가 가리킴)
// .gov.kr : 일부 중앙 정부 (정통)
// .or.kr  : 공공기관·공기업 (예: kosaf.go.kr 외 보조금 협회)
// .re.kr  : 연구기관 (정책 공모 등)
const PUBLIC_DOMAIN_SUFFIXES = [".go.kr", ".gov.kr", ".or.kr", ".re.kr"] as const;

// 본문 url 추출 정규식 — http/https 만, 한글·공백 만나면 종료
const URL_REGEX = /https?:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+/g;

/** url 의 host 가 정부·공공기관 도메인 화이트리스트에 속하는지 */
export function isPublicDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PUBLIC_DOMAIN_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

/** 본문 텍스트에서 모든 url 추출 (정규식). 중복 제거 */
export function extractUrlsFromBody(body: string | null | undefined): string[] {
  if (!body) return [];
  const matches = body.match(URL_REGEX) ?? [];
  // 끝의 마침표·괄호 등 trailing punctuation 제거 (URL_REGEX 가 그리디라 일부 흡수)
  const cleaned = matches.map((u) => u.replace(/[.,;:'")\]]+$/, ""));
  return Array.from(new Set(cleaned));
}

/**
 * 광역 도청 ministry 텍스트 → 매핑 url.
 * 시군 (예: '전라남도 순천시') 도 광역 prefix 매칭 — '전라남도' 광역 url 반환.
 * 매핑 없으면 null.
 */
export function resolveProvinceFallback(
  ministry: string | null | undefined,
): string | null {
  if (!ministry) return null;
  for (const [prefix, url] of Object.entries(PROVINCE_DEFAULT_URLS)) {
    if (ministry.startsWith(prefix)) return url;
  }
  return null;
}

/** url 후보 배열에서 정부 도메인 url 첫 번째 반환 */
function pickFirstPublicUrl(urls: string[]): string | null {
  for (const u of urls) {
    if (isPublicDomain(u)) return u;
  }
  return null;
}

export type ResolveApplyUrlInput = {
  /** LLM 이 직접 응답한 apply_url (null 가능) */
  llmApplyUrl: string | null;
  /** LLM 이 본문에서 추출한 url 배열 */
  bodyUrls: string[];
  /** 본문 텍스트 (LLM 미응답 시 정규식 fallback) */
  body: string | null | undefined;
  /** news_posts.ministry — 광역 매핑 키 */
  ministry: string | null | undefined;
  /** 최후 fallback — keepioo 뉴스 페이지 url (이미 host 안전) */
  sourceUrl: string;
};

export type ResolveApplyUrlResult = {
  url: string;
  /** 어느 layer 가 url 채웠는지 — 감사·통계용 */
  source: "llm" | "body_urls" | "body_regex" | "province" | "source_url";
};

/**
 * 4 layer fallback chain:
 *  1. LLM apply_url (정부 도메인이거나 비어있지 않으면 사용)
 *  2. LLM body_urls 중 정부 도메인
 *  3. 본문 정규식 추출 url 중 정부 도메인
 *  4. 광역 도청 매핑 url
 *  5. source_url (최후 — 항상 채워짐)
 *
 * 1번은 화이트리스트 미적용 (LLM 이 신중하게 추출한 직접 신청 url 신뢰).
 * 2~3번은 화이트리스트 강제 (광고·외부 사이트 차단).
 * 4~5번은 안전 도메인.
 */
export function resolveApplyUrl(input: ResolveApplyUrlInput): ResolveApplyUrlResult {
  // Layer 1 — LLM 직접 응답 신뢰
  if (input.llmApplyUrl && /^https?:\/\//i.test(input.llmApplyUrl)) {
    return { url: input.llmApplyUrl, source: "llm" };
  }

  // Layer 2 — LLM 추출 body_urls 화이트리스트 매칭
  const fromBodyUrls = pickFirstPublicUrl(input.bodyUrls);
  if (fromBodyUrls) {
    return { url: fromBodyUrls, source: "body_urls" };
  }

  // Layer 3 — 본문 정규식 추출 화이트리스트 매칭
  const regexUrls = extractUrlsFromBody(input.body);
  const fromRegex = pickFirstPublicUrl(regexUrls);
  if (fromRegex) {
    return { url: fromRegex, source: "body_regex" };
  }

  // Layer 4 — 광역 도청 매핑
  const province = resolveProvinceFallback(input.ministry);
  if (province) {
    return { url: province, source: "province" };
  }

  // Layer 5 — source_url 최후 fallback (항상 채워짐)
  return { url: input.sourceUrl, source: "source_url" };
}
