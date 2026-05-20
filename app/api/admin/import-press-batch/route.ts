// ============================================================
// /api/admin/import-press-batch — Playwright runner batch insert
// ============================================================
// 2026-05-21 #45 — SPA 시청 보도자료 (정적 collector 처리 불가) batch 등록.
// playwright/runner.mjs 가 매 6시간 호출 (KST 10/16/22/4).
//
// 인증: X-API-Key 헤더 = process.env.IMPORT_PRESS_API_KEY
//   사장님 PC runner / GitHub Actions secret 양쪽 동일 키.
//
// body:
//   {
//     city: "changwon" | "seongnam" | "ansan" | "cheonan" | ...,
//     items: [{ title, sourceUrl, publishedDate?, body }, ...]
//   }
//
// 동작:
//   - city → ministry / sourceOutlet 매핑 (PLAYWRIGHT_CITY_REGISTRY)
//   - news_posts insert. source_url UNIQUE → 중복 시 23505 skip.
//   - classified_at=null → 기존 press_ingest cron 이 LLM 분류 진입
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Playwright runner 의 city key → news_posts insert 메타.
// 다음 세션 추가: seongnam / ansan / cheonan.
const PLAYWRIGHT_CITY_REGISTRY: Record<
  string,
  { ministry: string; sourceOutlet: string; sourceCode: string }
> = {
  changwon: {
    ministry: "창원특례시청",
    sourceOutlet: "창원특례시청",
    sourceCode: "local-press-changwon",
  },
};

type BatchItem = {
  title?: unknown;
  sourceUrl?: unknown;
  publishedDate?: unknown;
  body?: unknown;
};

function sanitize(item: BatchItem): {
  title: string;
  sourceUrl: string;
  publishedDate: string | null;
  body: string;
} | null {
  if (typeof item.title !== "string" || item.title.length < 5) return null;
  if (typeof item.sourceUrl !== "string" || !/^https?:\/\//.test(item.sourceUrl))
    return null;
  if (typeof item.body !== "string" || item.body.length < 50) return null;
  let publishedDate: string | null = null;
  if (typeof item.publishedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.publishedDate)) {
    publishedDate = item.publishedDate;
  }
  return {
    title: item.title.trim().slice(0, 500),
    sourceUrl: item.sourceUrl,
    publishedDate,
    body: item.body.slice(0, 20000),
  };
}

export async function POST(request: Request) {
  // 인증 — X-API-Key 헤더
  const apiKey = request.headers.get("x-api-key");
  const expected = process.env.IMPORT_PRESS_API_KEY;
  if (!expected || !apiKey || apiKey !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { city?: string; items?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const cityKey = typeof body.city === "string" ? body.city : "";
  const cfg = PLAYWRIGHT_CITY_REGISTRY[cityKey];
  if (!cfg) {
    return NextResponse.json(
      { error: `unknown city: ${cityKey}` },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "items array 필수" }, { status: 400 });
  }

  // 최대 100건 cap — runner 가 cron 당 보통 10건. 비정상 폭주 차단.
  const items = body.items.slice(0, 100);
  const admin = createAdminClient();
  const now = new Date().toISOString();

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const raw of items) {
    const item = sanitize(raw as BatchItem);
    if (!item) {
      skipped += 1;
      continue;
    }
    const publishedAt = item.publishedDate
      ? `${item.publishedDate}T00:00:00+09:00`
      : now;

    const { error } = await admin.from("news_posts").insert({
      title: item.title,
      summary: item.body.slice(0, 500),
      body: item.body,
      source_url: item.sourceUrl,
      source_outlet: cfg.sourceOutlet,
      source_code: cfg.sourceCode,
      ministry: cfg.ministry,
      published_at: publishedAt,
      classified_at: null,
    });
    if (error) {
      if (error.code === "23505") {
        skipped += 1;
      } else {
        errors.push(error.message.slice(0, 100));
      }
    } else {
      inserted += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    city: cityKey,
    fetched: items.length,
    inserted,
    skipped,
    errors: errors.slice(0, 3),
  });
}
