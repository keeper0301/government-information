// app/api/cron/busan-verify/route.ts
// 부산 자치구 4곳(부산진·북구·사상·동래) 수집 검증 — 2026-06-01 수리 효과 확인용.
// 매일 KST 11시(= 02 UTC) 4곳의 24h/7d inserted + 최신 글을 조회해 텔레그램 발송.
// 6/1 수리: 부산진=BBS_0000031 교정, 북구=eminwon 재이관, 사상=icn1 TLS fallback, 날짜 2자리.
// proxy(부산진·사상) cron KST 10시 + 정적(북구 eminwon) 오전 이후 시점이라 11시 확인.
// ⚠️ 1주 모니터링 검증 완료 후 vercel.json crons 에서 제거 권장(상시 noise 방지).

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const BUSAN_CITIES = [
  { code: "local-press-busanjin", name: "부산진구" },
  { code: "local-press-bsbukgu", name: "부산 북구" },
  { code: "local-press-sasang", name: "사상구" },
  { code: "local-press-dongnae", name: "동래구" },
] as const;

async function sendTelegram(
  text: string,
): Promise<{ ok: boolean; status?: number; reason?: string }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return { ok: false, reason: "no_credentials" };
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    },
  );
  // status 포함 — 발송 실패(봇 차단·chat_id 오류·5xx) 시 수동 trigger 디버깅용.
  return { ok: res.ok, status: res.status };
}

async function run() {
  const admin = createAdminClient();
  const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const results: {
    name: string;
    cnt24: number;
    cnt7: number;
    latestPublished: string | null;
  }[] = [];

  for (const c of BUSAN_CITIES) {
    const { count: cnt24 } = await admin
      .from("news_posts")
      .select("*", { count: "exact", head: true })
      .eq("source_code", c.code)
      .gte("created_at", since24);
    const { count: cnt7 } = await admin
      .from("news_posts")
      .select("*", { count: "exact", head: true })
      .eq("source_code", c.code)
      .gte("created_at", since7d);
    const { data: latest } = await admin
      .from("news_posts")
      .select("published_at")
      .eq("source_code", c.code)
      .order("created_at", { ascending: false })
      .limit(1);
    results.push({
      name: c.name,
      cnt24: cnt24 ?? 0,
      cnt7: cnt7 ?? 0,
      latestPublished: latest?.[0]?.published_at ?? null,
    });
  }

  const lines = results.map((r) => {
    // ✅ 24h 수집 · 🟡 24h 0 이나 7d 있음 · ⚠️ 7d 0(수리 미작동/장기 무발행 의심)
    const icon = r.cnt24 > 0 ? "✅" : r.cnt7 > 0 ? "🟡" : "⚠️";
    const pub = r.latestPublished ? r.latestPublished.slice(0, 10) : "-";
    return `${icon} ${r.name}: 24h ${r.cnt24}건 / 7d ${r.cnt7}건 (최신 ${pub})`;
  });
  const text =
    "🏙 부산 자치구 수집 확인 (6/1 수리 검증)\n" +
    lines.join("\n") +
    "\n\n⚠️=7d 0건(수리 미작동·주말 의심) · 🟡=24h만 0";

  const telegram = await sendTelegram(text);
  return NextResponse.json({ ok: true, results, telegram });
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}

// POST 도 같은 동작 (수동 trigger 편의)
export async function POST(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}
