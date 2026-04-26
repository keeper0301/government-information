// ============================================================
// POST /api/wishes — 사용자 의견 수집 (받고 싶은 정책)
// ============================================================
// 비로그인 anon 도 작성 가능. RLS 가 INSERT 만 허용.
// 길이 검증 + 단순 IP hash (스팸 1차 방지).
// 어드민(service_role)만 SELECT 가능.
// ============================================================

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// 같은 ip_hash 가 RATE_WINDOW_SEC 초 안에 RATE_MAX 회 이상이면 거부.
// 봇 spam 1차 방어 (외부 사용자 만나기 전 워밍업).
const RATE_WINDOW_SEC = 60;
const RATE_MAX = 2;

type Body = {
  wish?: unknown;
  email?: unknown;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const wish = typeof body.wish === "string" ? body.wish.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : null;

  // 길이 검증 — DB CHECK 와 동일 기준
  if (wish.length < 5 || wish.length > 500) {
    return NextResponse.json(
      { error: "의견은 5~500자 사이여야 해요." },
      { status: 400 },
    );
  }
  if (email && (email.length > 200 || !email.includes("@"))) {
    return NextResponse.json(
      { error: "이메일 형식이 올바르지 않아요." },
      { status: 400 },
    );
  }

  // 간이 IP hash — 스팸·중복 분석용 (raw IP 저장 안 함, 익명성 보장)
  const ipRaw =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const ipHash = createHash("sha256")
    .update(`${ipRaw}:${process.env.NEXT_PUBLIC_SITE_URL ?? "keepioo"}`)
    .digest("hex")
    .slice(0, 24);
  const userAgent = request.headers.get("user-agent")?.slice(0, 250) ?? null;

  // Rate limit + INSERT 를 단일 RPC 로 처리 — TOCTOU race 차단 (049 마이그레이션).
  // 함수 내부에서 count → INSERT 가 같은 트랜잭션이라 race window 가 ms 수준.
  // 반환: 신규 row id (성공) 또는 NULL (rate limit 초과).
  // service_role 만 EXECUTE 가능 (047 + 049 잠금).
  const admin = createAdminClient();
  const { data: insertedId, error } = await admin.rpc(
    "insert_user_wish_with_rate_limit",
    {
      p_ip_hash: ipHash,
      p_wish: wish,
      p_email: email || null,
      p_user_agent: userAgent,
      p_window_sec: RATE_WINDOW_SEC,
      p_max_count: RATE_MAX,
    },
  );

  if (error) {
    console.error("[api/wishes] insert error", error);
    return NextResponse.json(
      { error: "잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  if (insertedId === null) {
    return NextResponse.json(
      { error: "잠시 후 다시 시도해주세요. 1분에 최대 2번까지 보낼 수 있어요." },
      { status: 429 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
