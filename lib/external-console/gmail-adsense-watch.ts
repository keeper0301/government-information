// ============================================================
// Gmail AdSense 이메일 자동 파싱 (D 옵션 — 2026-05-18 spec)
// ============================================================
// keeper0301@gmail.com 의 AdSense 알림 이메일 자동 감지 → 텔레그램.
// adsense-review-watch (state polling) + Gmail (이메일 도착) 2 채널.
//
// env:
//   GMAIL_CLIENT_ID
//   GMAIL_CLIENT_SECRET
//   GMAIL_REFRESH_TOKEN (scope: https://www.googleapis.com/auth/gmail.readonly)
//
// 미설정 시 graceful skip (adsense.ts·kakao.ts 패턴 동일).
//
// AdSense 발신: noreply-googleads@google.com / adsense-noreply@google.com
// 제목 keyword: "AdSense", "승인", "거절", "approved", "not approved", "정책 위반"
// ============================================================

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FETCH_TIMEOUT_MS = 15000;

export type AdSenseEmailVerdict =
  | "approved"   // 승인 — "AdSense 승인" / "approved"
  | "rejected"   // 거절 — "AdSense 거절" / "not approved"
  | "violation"  // 정책 위반 경고
  | "info"       // AdSense 일반 알림 (수익 보고서 등)
  | "unmatched"; // AdSense 발신이지만 키워드 매칭 X

interface GmailMessageListItem {
  id: string;
  threadId: string;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessage {
  id: string;
  internalDate?: string;
  snippet?: string;
  payload?: {
    headers?: GmailHeader[];
  };
}

// refresh_token → access_token (1시간 유효, 호출당 1번 발급)
async function getAccessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`gmail token refresh ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("gmail token refresh: access_token 누락");
  return data.access_token;
}

async function googleFetch<T>(url: string, token: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Gmail API ${res.status}: ${t.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// pure function — 제목 + snippet 으로 verdict 분류 (단위 테스트 가능)
export function classifyAdsenseEmail(input: {
  subject: string;
  snippet: string;
}): AdSenseEmailVerdict {
  const text = `${input.subject}\n${input.snippet}`.toLowerCase();

  // 승인 keyword (한·영 모두)
  if (
    /승인|승인되었|approved|approval/i.test(text) &&
    !/거절|not approved|denied|rejected/i.test(text)
  ) {
    return "approved";
  }

  // 거절 keyword
  if (/거절|not approved|denied|rejected|승인되지 않/i.test(text)) {
    return "rejected";
  }

  // 정책 위반·경고
  if (/정책 위반|policy violation|warning|위반/i.test(text)) {
    return "violation";
  }

  // AdSense 관련 일반 정보 (수익 보고서·뉴스레터 등)
  if (/adsense|애드센스/i.test(text)) {
    return "info";
  }

  return "unmatched";
}

export type AdsenseGmailResult = {
  /** 감지된 message id 목록 */
  matchedIds: string[];
  /** 가장 최근 매칭 이메일의 verdict (UI 표시용) */
  latestVerdict: AdSenseEmailVerdict | null;
  /** 가장 최근 매칭 이메일의 subject */
  latestSubject: string | null;
  /** OAuth env missing 또는 API 실패 시 사유 */
  error: string | null;
};

export async function checkAdsenseGmail(): Promise<AdsenseGmailResult> {
  if (
    !process.env.GMAIL_CLIENT_ID ||
    !process.env.GMAIL_CLIENT_SECRET ||
    !process.env.GMAIL_REFRESH_TOKEN
  ) {
    return {
      matchedIds: [],
      latestVerdict: null,
      latestSubject: null,
      error: "skipped: Gmail credentials missing",
    };
  }

  try {
    const token = await getAccessToken();

    // 최근 7일 AdSense 발신 이메일 검색 — 검수 기간 5~14일 충분 cover
    const q = encodeURIComponent(
      "(from:noreply-googleads@google.com OR from:adsense-noreply@google.com) newer_than:7d",
    );
    const listUrl = `${GMAIL_API}/users/me/messages?q=${q}&maxResults=10`;
    const list = await googleFetch<{ messages?: GmailMessageListItem[] }>(
      listUrl,
      token,
    );

    if (!list.messages || list.messages.length === 0) {
      return {
        matchedIds: [],
        latestVerdict: null,
        latestSubject: null,
        error: null,
      };
    }

    // 가장 최근 메시지 1건 detail 조회 (제목 + snippet)
    const latest = list.messages[0];
    const msgUrl = `${GMAIL_API}/users/me/messages/${latest.id}?format=metadata&metadataHeaders=Subject`;
    const msg = await googleFetch<GmailMessage>(msgUrl, token);
    const subject =
      msg.payload?.headers?.find((h) => h.name === "Subject")?.value ?? "";
    const snippet = msg.snippet ?? "";

    return {
      matchedIds: list.messages.map((m) => m.id),
      latestVerdict: classifyAdsenseEmail({ subject, snippet }),
      latestSubject: subject,
      error: null,
    };
  } catch (e) {
    return {
      matchedIds: [],
      latestVerdict: null,
      latestSubject: null,
      error: (e as Error).message,
    };
  }
}
