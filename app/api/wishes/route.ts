// ============================================================
// POST /api/wishes — 사용자 의견 수집 (받고 싶은 정책)
// ============================================================
// 비로그인 anon 도 작성 가능. RLS 가 INSERT 만 허용.
// 길이 검증 + 단순 IP hash (스팸 1차 방지).
// 어드민(service_role)만 SELECT 가능.
// ============================================================

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

  const supabase = await createClient();
  const { error } = await supabase.from("user_wishes").insert({
    wish,
    email: email || null,
    ip_hash: ipHash,
    user_agent: userAgent,
  });

  if (error) {
    console.error("[api/wishes] insert error", error);
    return NextResponse.json(
      { error: "잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
