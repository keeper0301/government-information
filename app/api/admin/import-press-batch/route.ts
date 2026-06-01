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
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeNewsSourceId, makeNewsSlug } from "@/lib/news/slug-helpers";
import { logAdminAction } from "@/lib/admin-actions";
import { PLAYWRIGHT_CITY_REGISTRY } from "@/lib/scraping/local-press/_playwright-city-registry";

// API key 비교는 길이 분기 + timingSafeEqual 로 — 단순 `!==` 는 early-return 으로
// 길이/prefix 추론 timing attack 노출.
function safeKeyEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
// node:crypto timingSafeEqual 사용 — Edge runtime 미지원이므로 명시.
export const runtime = "nodejs";

// 본문 최소 길이 — playwright/lib/_factory.mjs 의 BODY_MIN_LEN 과 동기화 필수.
// (cross-module import 가 .mjs/.ts 경계라 어색해 로컬 상수 유지. 변경 시 양쪽 같이.)
const BODY_MIN_LEN = 250;

// Playwright runner 의 city key → news_posts insert 메타. registry 정의는
// lib/scraping/local-press/_playwright-city-registry.ts 단일 출처 (가동 카드와 공용).
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
  // 2026-05-30 50 → BODY_MIN_LEN(250) 상향. AdSense thin content 페널티 표면 ↓.
  // 110~249 자 짧은 알림(첨부파일 + 한 줄 안내)은 정책 가이드 가치 미미.
  if (typeof item.body !== "string" || item.body.length < BODY_MIN_LEN) return null;
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
  // 인증 — X-API-Key 헤더 (timing-safe 비교)
  // Vercel UI 입력 trailing whitespace 사고 예방 차원에서 양쪽 trim.
  const apiKey = request.headers.get("x-api-key")?.trim();
  const expected = process.env.IMPORT_PRESS_API_KEY?.trim();
  if (!expected || !apiKey || !safeKeyEqual(apiKey, expected)) {
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
  let nullDate = 0; // factory 가 date 못 잡아 now 로 fallback 한 건수 (audit 가시화).
  const errors: string[] = [];

  for (const raw of items) {
    const item = sanitize(raw as BatchItem);
    if (!item) {
      skipped += 1;
      continue;
    }
    if (!item.publishedDate) nullDate += 1;
    const publishedAt = item.publishedDate
      ? `${item.publishedDate}T00:00:00+09:00`
      : now;

    // NOT NULL 가드 — source_id / category / slug 누락 시 silent fail (audit 2026-05-22).
    const sourceId = makeNewsSourceId(item.sourceUrl);
    const slug = makeNewsSlug(item.title, cityKey, sourceId);

    const { error } = await admin.from("news_posts").insert({
      title: item.title,
      summary: item.body.slice(0, 500),
      body: item.body,
      source_url: item.sourceUrl,
      source_outlet: cfg.sourceOutlet,
      source_code: cfg.sourceCode,
      source_id: sourceId,
      category: "news",
      slug,
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

  // autonomous hub LocalPressCard 가시화용 audit (admin_actions.local_press_scrape).
  // city 는 ministry 에서 "청" 제거(노원구청→노원구) → stats 의 city 집계와 매칭.
  // audit 실패가 수집 응답을 막지 않도록 try-catch.
  try {
    await logAdminAction({
      actorId: null,
      action: "local_press_scrape",
      details: {
        trigger: "proxy",
        city: cfg.ministry.replace(/청$/, ""),
        fetched: items.length,
        inserted,
        null_date: nullDate, // factory date 추출 실패 = silent now-fallback 가시화
        errors,
      },
    });
  } catch {
    // audit insert 실패는 무시 (수집 자체는 성공)
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
