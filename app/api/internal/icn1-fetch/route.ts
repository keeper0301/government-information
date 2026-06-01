// ============================================================
// /api/internal/icn1-fetch — 한국(icn1) egress 프록시
// ============================================================
// 정부 사이트가 해외 데이터센터 IP 를 지오차단하므로, 해외(GitHub Actions)에서 도는
// 풀 chromium 의 정부 도메인 요청을 이 endpoint(서울 리전)로 우회시켜 한국 IP 로 받아온다.
// page.route → 이 endpoint(POST) → fetch(한국 IP) → 응답 바이트 그대로(base64) 반환.
//
// 보안:
//   - X-API-Key (= IMPORT_PRESS_API_KEY) 인증 필수.
//   - 정부 도메인 allowlist 만 허용 (오픈 프록시·SSRF 방지).
//   - http(s) 만, IP 리터럴 host 거부.
// 인코딩: 응답 디코딩 없이 바이트 그대로 + Content-Type(charset) 보존 → chromium 정상 디코딩.
// ============================================================

import { NextResponse } from "next/server";
import { Agent } from "undici";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// 2026-06-01 — 일부 정부 사이트(사상구 등)가 SSL 인증서 체인 불완전(intermediate 누락)
// 이라 server-side fetch 가 UNABLE_TO_VERIFY_LEAF_SIGNATURE 로 실패. 브라우저는 AIA 로
// 누락 인증서를 자동 보완하나 node(undici) fetch 는 실패 → 사상 collector proxy 0건 사고.
// 정상 검증을 먼저 시도하고, "체인 검증" 오류일 때만 검증 완화로 1회 재시도한다.
// allowlist(.go.kr 등 정부 도메인)로 이미 제한 + 본문 텍스트만 수집이라 MITM 위험 최소.
// 정상 인증서 사이트는 검증을 그대로 유지(완화 fallback 진입 안 함).
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
const TLS_CHAIN_ERROR_CODES = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "SELF_SIGNED_CERT_IN_CHAIN",
]);

async function govFetch(target: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(target, init);
  } catch (e) {
    const code = (e as { cause?: { code?: string } }).cause?.code;
    if (code && TLS_CHAIN_ERROR_CODES.has(code)) {
      // 체인 불완전 정부 사이트 — TLS 검증 완화 후 1회 재시도.
      return await fetch(target, {
        ...init,
        dispatcher: insecureAgent,
      } as RequestInit & { dispatcher: unknown });
    }
    throw e;
  }
}

// 정부/지자체 도메인만 허용. 우리가 수집하는 호스트 패턴.
const ALLOWED_SUFFIX = [
  ".go.kr",
  ".gwangju.kr",
  ".incheon.kr",
  ".seoul.kr",
  ".nowon.kr",
  ".donggu.kr",
  ".korea.kr",
];
// suffix 매칭 + 정확 호스트(서브도메인 없는 nowon.kr 등)도 허용
const ALLOWED_EXACT = ["nowon.kr", "donggu.kr"];

function isGovAllowed(rawUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  // IP 리터럴 거부
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return false;
  if (ALLOWED_EXACT.includes(host)) return true;
  return ALLOWED_SUFFIX.some((s) => host.endsWith(s));
}

// 브라우저가 보낸 헤더 중 정부 사이트로 그대로 넘길 것 (hop-by-hop·호스트 제외).
const FORWARD_REQ_HEADERS = ["user-agent", "accept", "accept-language", "referer", "cookie", "content-type"];
// 브라우저로 돌려줄 응답 헤더.
const RETURN_RES_HEADERS = ["content-type", "set-cookie", "location", "cache-control"];

export async function POST(request: Request) {
  if (request.headers.get("x-api-key") !== process.env.IMPORT_PRESS_API_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { url?: string; method?: string; headers?: Record<string, string>; postData?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const target = typeof body.url === "string" ? body.url : "";
  if (!isGovAllowed(target)) {
    return NextResponse.json({ error: "domain not allowed" }, { status: 403 });
  }

  const reqHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.headers ?? {})) {
    if (FORWARD_REQ_HEADERS.includes(k.toLowerCase())) reqHeaders[k] = v;
  }

  try {
    const res = await govFetch(target, {
      method: body.method ?? "GET",
      headers: reqHeaders,
      body: body.postData ?? undefined,
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const outHeaders: Record<string, string> = {};
    for (const h of RETURN_RES_HEADERS) {
      const v = res.headers.get(h);
      if (v) outHeaders[h] = v;
    }
    return NextResponse.json({
      status: res.status,
      headers: outHeaders,
      bodyB64: buf.toString("base64"),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 120) }, { status: 502 });
  }
}
