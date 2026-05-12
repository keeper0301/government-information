// ============================================================
// 네이버 블로그 RPA — Playwright cookies vault
// ============================================================
// 사장님 Chrome 에서 export 한 네이버 세션 cookies 를 Supabase 에 안전 저장.
// service_role 만 접근 (RLS 정책 0개로 anon·authenticated 완전 차단).
//
// 흐름:
//   1) 사장님이 Chrome DevTools 의 Cookies export → JSON 복사
//   2) /admin/naver-blog/cookies 페이지에 붙여넣기 → 검증 + 저장
//   3) Phase 3 cron 이 getActiveCookies() 로 fresh cookies 로드
//   4) Playwright context.addCookies(cookies) 로 inject
//   5) health-alert cron 이 expires_min 임박 시 텔레그램 push
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type NaverCookie = {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number; // unix seconds
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

export type NaverCookieRow = {
  id: string;
  cookies: NaverCookie[];
  uploadedAt: string;
  active: boolean;
  expiresMin: string | null;
  notes: string | null;
};

/**
 * 사장님 입력 JSON 을 검증하고 정규화.
 * 다양한 export 형식 지원:
 *   - { cookies: [...] }  (Playwright storage_state 또는 BublBot 형식)
 *   - [...]               (단순 배열)
 *   - { ... }             (단일 cookie 객체 — 거부)
 */
export function parseAndValidateCookies(raw: string): NaverCookie[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("JSON 형식이 잘못됐어요. Chrome DevTools 에서 정확히 복사했는지 확인하세요.");
  }

  // 다양한 형식 normalize
  let arr: unknown[];
  if (Array.isArray(data)) {
    arr = data;
  } else if (data && typeof data === "object" && Array.isArray((data as { cookies?: unknown }).cookies)) {
    arr = (data as { cookies: unknown[] }).cookies;
  } else {
    throw new Error(
      "cookies 배열을 못 찾았어요. 형식: [{name, value, domain, ...}, ...] 또는 { cookies: [...] }",
    );
  }

  if (arr.length === 0) {
    throw new Error("cookies 가 비어 있어요.");
  }

  // 각 cookie 검증 + 정규화
  const cookies: NaverCookie[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const c = item as Record<string, unknown>;
    const name = typeof c.name === "string" ? c.name : null;
    const value = typeof c.value === "string" ? c.value : null;
    let domain = typeof c.domain === "string" ? c.domain : null;

    if (!name || !value || !domain) continue;

    // domain 정규화 (.naver.com 형식)
    if (!domain.startsWith(".") && !domain.startsWith("www.")) {
      domain = `.${domain}`;
    }

    // naver.com 또는 nid.naver.com 도메인만 허용
    if (!domain.includes("naver.com")) continue;

    const cookie: NaverCookie = {
      name,
      value,
      domain,
      path: typeof c.path === "string" ? c.path : "/",
      httpOnly: c.httpOnly === true,
      secure: c.secure === true,
    };

    // expires 또는 expiry → unix seconds
    const expVal = typeof c.expires === "number" ? c.expires : typeof c.expiry === "number" ? c.expiry : null;
    if (expVal && expVal > 0) {
      cookie.expires = expVal;
    }

    // sameSite normalize
    const ss = typeof c.sameSite === "string" ? c.sameSite : null;
    if (ss === "Strict" || ss === "Lax" || ss === "None") {
      cookie.sameSite = ss;
    } else if (ss?.toLowerCase() === "no_restriction") {
      cookie.sameSite = "None";
    } else if (ss?.toLowerCase() === "lax") {
      cookie.sameSite = "Lax";
    }

    cookies.push(cookie);
  }

  if (cookies.length === 0) {
    throw new Error("유효한 naver.com cookies 가 없어요. 도메인이 .naver.com 인 cookies 만 인식됩니다.");
  }

  // 핵심 인증 cookies 검증 (이게 없으면 로그인 안 됨)
  const names = new Set(cookies.map((c) => c.name));
  const required = ["NID_AUT", "NID_SES"];
  const missing = required.filter((n) => !names.has(n));
  if (missing.length > 0) {
    throw new Error(
      `핵심 인증 cookie 누락: ${missing.join(", ")}. naver.com 에 정상 로그인된 상태에서 다시 export 해주세요.`,
    );
  }

  return cookies;
}

/**
 * cookies 의 가장 빠른 만료 시점 (unix seconds) → ISO string.
 * 핵심 인증 cookies (NID_AUT/SES/JST) 만 기준 — 추적 cookies (SRT5/30 등) 는
 * 분 단위로 자주 만료되지만 발행 동작에 영향 없음. 인스타 health alert 폭주 사고 회피.
 */
const AUTH_COOKIES = new Set(["NID_AUT", "NID_SES", "NID_JST", "BUC", "NNB"]);
export function minExpiresIso(cookies: NaverCookie[]): string | null {
  const expiries = cookies
    .filter((c) => AUTH_COOKIES.has(c.name))
    .map((c) => c.expires)
    .filter((e): e is number => typeof e === "number" && e > 0);
  if (expiries.length === 0) return null;
  return new Date(Math.min(...expiries) * 1000).toISOString();
}

/**
 * 새 cookies 저장. 이전 active row 의 active=false 처리.
 */
export async function saveCookies(
  cookies: NaverCookie[],
  uploadedBy: string,
  notes: string | null,
): Promise<{ id: string; expiresMin: string | null }> {
  const admin = createAdminClient();
  const expiresMin = minExpiresIso(cookies);

  // 1) 기존 active 모두 inactive
  await admin
    .from("naver_session_cookies")
    .update({ active: false })
    .eq("active", true);

  // 2) 새 row insert
  const { data, error } = await admin
    .from("naver_session_cookies")
    .insert({
      cookies,
      uploaded_by: uploadedBy,
      active: true,
      expires_min: expiresMin,
      notes,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`cookies 저장 실패: ${error?.message ?? "unknown"}`);
  }

  return { id: data.id, expiresMin };
}

/**
 * 현재 active cookies 가져오기 (Phase 3 cron 이 호출).
 */
export async function getActiveCookies(): Promise<NaverCookieRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("naver_session_cookies")
    .select("id, cookies, uploaded_at, active, expires_min, notes")
    .eq("active", true)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`active cookies 조회 실패: ${error.message}`);
  }
  if (!data) return null;

  return {
    id: data.id,
    cookies: data.cookies as NaverCookie[],
    uploadedAt: data.uploaded_at,
    active: data.active,
    expiresMin: data.expires_min,
    notes: data.notes,
  };
}
