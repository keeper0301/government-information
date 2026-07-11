// ============================================================
// /api/webhook/solapi-receive — Solapi 양방향 SMS 수신 callback
// ============================================================
// Phase 2 자율 운영 — 사장님 휴대폰 답장을 webhook 으로 받아 결정 라우팅.
//
// Solapi 콘솔에서 등록할 webhook URL: https://www.keepioo.com/api/webhook/solapi-receive
// (Solapi 양방향 SMS 활성화 후 콘솔의 "수신 webhook" 섹션에서 등록 — 사장님 외부 액션)
//
// 인증:
//   - Solapi 가 서명 헤더 (Authorization: Solapi apiKey:salt:signature) 동봉.
//   - SOLAPI_WEBHOOK_SECRET env 로 HMAC-SHA256 검증.
//   - 미설정 시 모든 요청 reject (운영 보호).
//
// 처리:
//   - body { message: { from, text, ... } } 파싱
//   - handleSmsReply 호출 → 결정 매칭 + 액션
//   - 200 OK 반환 (Solapi 가 retry 안 하도록)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { handleSmsReply } from "@/lib/sms/decision-router";
import { isJsonBodyTooLargeError, readTextWithLimit } from "@/lib/http/json";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const MAX_WEBHOOK_BODY_BYTES = 32 * 1024;

// Solapi webhook 서명 검증 — 공식 문서 기준 HMAC-SHA256.
// 헤더: Authorization: HMAC-SHA256 apiKey=..., date=..., salt=..., signature=...
// 또는 단순 X-Solapi-Signature 헤더 (양식은 Solapi 콘솔에서 확인). 여기선
// 보수적으로 환경변수 SOLAPI_WEBHOOK_SECRET 와 raw body 의 HMAC 비교.
function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.SOLAPI_WEBHOOK_SECRET;
  if (!secret || !header) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  // 헤더가 "sha256=..." 형식이거나 raw hex 둘 다 허용 (Solapi 변경 대비)
  const candidate = header.replace(/^sha256=/, "").trim();
  if (candidate.length !== expected.length) return false;
  // 타이밍 공격 방지 — timingSafeEqual
  try {
    return crypto.timingSafeEqual(
      Buffer.from(candidate, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

interface SolapiReceivePayload {
  message?: {
    from?: string;
    text?: string;
    messageId?: string;
    receivedAt?: string;
  };
  // Solapi 가 미래에 페이로드 변경 시 대비 — 미사용 필드 무시
  [key: string]: unknown;
}

export async function POST(req: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await readTextWithLimit(req, MAX_WEBHOOK_BODY_BYTES);
  } catch (err) {
    return NextResponse.json(
      { error: isJsonBodyTooLargeError(err) ? "body_too_large" : "invalid_body" },
      { status: isJsonBodyTooLargeError(err) ? 413 : 400 },
    );
  }

  const sigHeader =
    req.headers.get("x-solapi-signature") ??
    req.headers.get("authorization");

  if (!verifySignature(rawBody, sigHeader)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: SolapiReceivePayload;
  try {
    payload = JSON.parse(rawBody) as SolapiReceivePayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const from = payload.message?.from;
  const text = payload.message?.text;
  if (!from || !text) {
    return NextResponse.json(
      { error: "missing_message_fields" },
      { status: 400 },
    );
  }

  // 2026-05-22 — SMS off (사장님 명시) 면 webhook graceful skip.
  // Solapi 가 발송 안 하니 답장 자체도 0 예상이지만, 콘솔에 webhook 등록되어
  // 있고 다른 sender (테스트·spam) 가 trigger 할 가능성 차단.
  if (process.env.OPS_ALERT_DISABLE_SMS === "true") {
    return NextResponse.json({
      ok: false,
      reason: "sms_disabled",
      note: "SMS off 상태 — 텔레그램 /decide 또는 /admin/decisions 사용",
    });
  }

  const result = await handleSmsReply({ from, text });

  // Solapi 가 200 OK 받지 못하면 재시도 — 결정 매칭 결과는 200 으로 반환,
  // 화이트리스트 차단 등 reject 도 200 (재시도 무의미). 서명 실패만 401.
  return NextResponse.json(result);
}
