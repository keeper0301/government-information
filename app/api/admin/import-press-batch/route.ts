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
import { makeNewsSourceId, makeNewsSlug } from "@/lib/news/slug-helpers";
import { logAdminAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Playwright runner 의 city key → news_posts insert 메타. 활성 12 도시
// (KEEPIOO_RUNNER_CITIES 기본값과 동기화). 도시 추가 시 여기 + workflow yml 둘 다 갱신.
// ※ 부산: 광역(busan)은 정적 collector (lib/scraping/local-press/busan.ts) 가 담당하고
//   자치구(dongnae·busanjin·geumjeong·bsbukgu·sasang)는 여기 playwright 경로로 수집.
//   두 시스템 공존이지만 source_code 가 분리되어 서로 영향 없음.
const PLAYWRIGHT_CITY_REGISTRY: Record<
  string,
  { ministry: string; sourceOutlet: string; sourceCode: string }
> = {
  changwon: {
    ministry: "창원특례시청",
    sourceOutlet: "창원특례시청",
    sourceCode: "local-press-changwon",
  },
  seongnam: {
    ministry: "성남시청",
    sourceOutlet: "성남시청",
    sourceCode: "local-press-seongnam",
  },
  ansan: {
    ministry: "안산시청",
    sourceOutlet: "안산시청",
    sourceCode: "local-press-ansan",
  },
  cheonan: {
    ministry: "천안시청",
    sourceOutlet: "천안시청",
    sourceCode: "local-press-cheonan",
  },
  // 2026-05-29 — 노원구: 정적 BD_select 본문 elusive → Playwright PC 러너로 이관.
  nowon: {
    ministry: "노원구청",
    sourceOutlet: "노원구청",
    sourceCode: "local-press-nowon",
  },
  // 2026-05-29 — 동래구 구정소식(BBS_0000012). 정적은 BBS_0000001(사전정보공개) 오등록이라 0건.
  dongnae: {
    ministry: "동래구청",
    sourceOutlet: "동래구청",
    sourceCode: "local-press-dongnae",
  },
  // 2026-05-29 — 부산 SI CMS 자치구 3종 (부산진·금정·북구). Playwright 프록시 경로 이관.
  busanjin: {
    ministry: "부산진구청",
    sourceOutlet: "부산진구청",
    sourceCode: "local-press-busanjin",
  },
  geumjeong: {
    ministry: "금정구청",
    sourceOutlet: "금정구청",
    sourceCode: "local-press-geumjeong",
  },
  bsbukgu: {
    ministry: "부산 북구청",
    sourceOutlet: "부산 북구청",
    sourceCode: "local-press-bsbukgu",
  },
  // 2026-05-29 — 사상구: 구정소식 게시판 부재. 알림사항(sasang) + 소식지(sasang_news) 2종.
  sasang: {
    ministry: "사상구청",
    sourceOutlet: "사상구청",
    sourceCode: "local-press-sasang",
  },
  sasang_news: {
    ministry: "사상구청",
    sourceOutlet: "사상구청",
    sourceCode: "local-press-sasang-news",
  },
  // 2026-05-29 — 김포시 보도자료(17,781건+). 목록 위젯 혼재·본문 무class td 라 프록시 경로.
  gimpo: {
    ministry: "김포시청",
    sourceOutlet: "김포시청",
    sourceCode: "local-press-gimpo",
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
