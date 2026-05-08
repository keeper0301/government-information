// ============================================================
// /api/support/submit — 사용자 CS 문의 접수 (Phase 4 자율 운영)
// ============================================================
// POST { subject?, message, contact_email?, contact_phone? }
//   → intent 분류 → support_tickets insert → 자동 응답 가능 시 즉시 응답
//
// 안전 가드:
//   - rate limit (IP 기반 1분 5회) — Phase 4-B 추가 spec
//   - message 길이 제한 (1000자)
//   - 익명 가능 (user_id NULL + email 필수)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifySupportIntent,
  canAutoReply,
  AUTO_REPLIES,
} from "@/lib/support/intent";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_MESSAGE_LEN = 1000;
const MAX_SUBJECT_LEN = 200;

interface SubmitBody {
  subject?: string;
  message?: string;
  contact_email?: string;
  contact_phone?: string;
}

export async function POST(req: NextRequest) {
  let body: SubmitBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  const subject = (body.subject ?? "").trim();
  const contactEmail = (body.contact_email ?? "").trim();
  const contactPhone = (body.contact_phone ?? "").trim();

  if (!message) {
    return NextResponse.json({ error: "message_required" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json(
      { error: "message_too_long", max: MAX_MESSAGE_LEN },
      { status: 400 },
    );
  }
  if (subject.length > MAX_SUBJECT_LEN) {
    return NextResponse.json(
      { error: "subject_too_long", max: MAX_SUBJECT_LEN },
      { status: 400 },
    );
  }

  // 작성자 식별 — 로그인 사용자 우선, 익명이면 contact_email 필수
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !contactEmail) {
    return NextResponse.json(
      { error: "contact_email_required_for_anonymous" },
      { status: 400 },
    );
  }

  // intent 분류 — Claude Haiku 1회. 실패해도 row 는 insert (사장님 큐 직행).
  const classification = await classifySupportIntent(message, subject);

  // 자동 응답 매칭
  const autoReply = canAutoReply(classification.intent, classification.confidence)
    ? (AUTO_REPLIES[classification.intent] ?? null)
    : null;

  const admin = createAdminClient();
  const { data: inserted, error: insertError } = await admin
    .from("support_tickets")
    .insert({
      user_id: user?.id ?? null,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
      subject: subject || null,
      message,
      intent: classification.intent,
      intent_confidence: classification.confidence,
      intent_reason: classification.reason,
      status: autoReply ? "auto_replied" : "open",
      auto_response: autoReply,
    })
    .select("id, intent, status, auto_response")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: "insert_failed", detail: insertError?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    ticket_id: inserted.id,
    intent: inserted.intent,
    status: inserted.status,
    auto_response: inserted.auto_response,
  });
}
