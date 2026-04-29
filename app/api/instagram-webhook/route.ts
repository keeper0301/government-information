/**
 * Instagram Comment Webhook endpoint.
 *
 * Meta 가 GET /api/instagram-webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 * 로 verify challenge 보내면 challenge 문자열 echo. POST 로 댓글 페이로드 받으면
 * HMAC 서명 검증 후 200 OK (현재 phase 1 = 로그만, 실제 처리는 keepio_agent
 * 의 instagram-dm-bot 모듈이 phase 2 에서 forward 받아 처리).
 *
 * 환경변수 (Vercel dashboard 에서 설정):
 *   INSTAGRAM_WEBHOOK_VERIFY_TOKEN — Meta 콘솔에 입력한 검증 토큰과 일치
 *   INSTAGRAM_APP_SECRET           — Meta 앱 시크릿 (서명 검증용, 옵션)
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

const VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET;

/** Meta verify challenge — GET 으로 hub.challenge 받으면 그대로 echo */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (
    !VERIFY_TOKEN ||
    mode !== "subscribe" ||
    token !== VERIFY_TOKEN ||
    !challenge
  ) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

/**
 * Meta comment webhook payload — POST 으로 댓글 정보 도착.
 *
 * APP_SECRET 가 미설정이면 503 fail-closed (이전엔 검증 우회로 누구나 임의
 * POST 가능 → 로그/Sentry 폭주 + phase 2 forward 시작 시 prompt injection
 * 위험). HMAC sha256 서명 검증 통과한 페이로드만 로그.
 *
 * payload 통째로 console.log 하던 것은 PII 누출 위험 → object 키 + length
 * 만 출력 (phase 2 forward 시 supabase 에 sanitize 후 INSERT 예정).
 */
export async function POST(req: NextRequest) {
  // APP_SECRET 없으면 fail-closed (phase 2 forward 전 보안 hygiene 필수)
  if (!APP_SECRET) {
    return new NextResponse("Webhook not configured", { status: 503 });
  }

  const rawBody = await req.text();

  const sig = req.headers.get("x-hub-signature-256");
  if (!sig) {
    return new NextResponse("Bad signature", { status: 403 });
  }
  const expected =
    "sha256=" +
    createHmac("sha256", APP_SECRET).update(rawBody).digest("hex");

  // timingSafeEqual 로 timing attack 방어. byte length 다르면 즉시 reject.
  // (Buffer.byteLength 비교 — string.length 는 비-ASCII 시 byte 수와 다름)
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) {
    return new NextResponse("Bad signature", { status: 403 });
  }
  if (!timingSafeEqual(sigBuf, expectedBuf)) {
    return new NextResponse("Bad signature", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  // payload 통째 로그 X — 키 + body length 만 (phase 2 에서 sanitize 후 INSERT)
  const keys =
    payload && typeof payload === "object" ? Object.keys(payload) : [];
  console.log(
    "[instagram-webhook] received:",
    JSON.stringify({ keys, bodyLength: rawBody.length }),
  );

  return new NextResponse("OK", { status: 200 });
}
