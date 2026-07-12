// ============================================================
// /api/events/track — 사용자 click event 기록
// ============================================================
// Phase A 클릭 분석 (migration 093). 클라이언트 component 가 사용자 액션
// 발생 시 호출 → user_events INSERT.
//
// 인증: 누구나 호출 가능 (user_id NULL 가능 — 익명 추적).
// 보호: Supabase fixed-window rate limit (IP 당 분당 60건) — serverless instance 분산 abuse 차단.
//
// POST body:
//   { event_type, program_id?, program_table?, source_page? }
// ============================================================

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isJsonBodyTooLargeError,
  readJsonWithLimit,
} from "@/lib/http/json";
import { checkRateLimit, getClientIp } from "@/lib/support/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const VALID_EVENT_TYPES = new Set([
  "program_view",
  "apply_click",
  "recommend_click",
  "home_recommend_click",
]);

const VALID_PROGRAM_TABLES = new Set([
  "welfare_programs",
  "loan_programs",
  "news_posts",
]);

const MAX_JSON_BODY_BYTES = 4 * 1024;
const EVENT_TRACK_LIMIT_PER_MINUTE = 60;

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit({
    bucket: `events:ip:${getClientIp(req)}`,
    limit: EVENT_TRACK_LIMIT_PER_MINUTE,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limit", retry_after_sec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const body = await readJsonWithLimit<Record<string, unknown>>(req, MAX_JSON_BODY_BYTES).catch((err) => {
    if (isJsonBodyTooLargeError(err)) return "too_large" as const;
    return null;
  });
  if (body === "too_large") {
    return NextResponse.json({ error: "body_too_large" }, { status: 413 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const eventType = String(body.event_type ?? "");
  if (!VALID_EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ error: "invalid_event_type" }, { status: 400 });
  }

  const programTable = body.program_table
    ? String(body.program_table)
    : null;
  if (programTable && !VALID_PROGRAM_TABLES.has(programTable)) {
    return NextResponse.json({ error: "invalid_program_table" }, { status: 400 });
  }

  // user_id — 로그인 시 fetch, 익명이면 null
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // INSERT — admin client (RLS 우회, anon INSERT 차단 보호)
  const admin = createAdminClient();
  const { error } = await admin.from("user_events").insert({
    user_id: user?.id ?? null,
    event_type: eventType,
    program_id: typeof body.program_id === "string" ? body.program_id : null,
    program_table: programTable,
    source_page:
      typeof body.source_page === "string"
        ? body.source_page.slice(0, 200)
        : null,
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 200),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2026-06-13 — 정책 상세 페이지 정적 ISR 전환에 따라 view_count 증가를 서버 렌더가
  // 아닌 이 클라이언트 program_view 경로로 이전(정적 페이지는 매 요청 렌더 안 함).
  // ⚠️ await 필수 — fire-and-forget(.then) 으로 두면 서버리스 함수가 응답 후 동결돼
  // RPC 가 완료되기 전에 죽어 view_count 가 안 오름(2026-06-13 검증: track 응답 ok 인데
  // view_count 0 증가). 백그라운드 분석 endpoint 라 await 지연 무방. 분산 rate limit 이 부풀림 차단.
  if (
    eventType === "program_view" &&
    programTable &&
    typeof body.program_id === "string"
  ) {
    const { error: rpcErr } = await admin.rpc("increment_view_count", {
      p_table_name: programTable,
      p_row_id: body.program_id,
    });
    if (rpcErr) console.error("[events/track] view count error:", rpcErr);
  }

  return NextResponse.json({ ok: true });
}
