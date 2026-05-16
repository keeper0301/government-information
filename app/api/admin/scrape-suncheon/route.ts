// ============================================================
// /api/admin/scrape-suncheon — 순천시청 보도자료 수집 endpoint
// ============================================================
// 사장님 1 호출 시범 수집. cron 가동 전 prototype 검증.
//
// POST body: { limit?: number } (기본 10건)
//
// 흐름:
//   1) lib/scraping/local-press/suncheon.fetchSuncheonRecent(limit)
//   2) news_posts INSERT (ministry="전라남도 순천시")
//      · 중복 차단: source_url UNIQUE constraint (이미 있음)
//   3) press_ingest cron 이 신규 row 자동 분류 (다음 cron 시점에)
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { fetchSuncheonRecent } from "@/lib/scraping/local-press/suncheon";
import { logAdminAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
// 10건 × (목록 fetch 1 + 상세 10 + 200ms sleep × 9) ≈ 15s. 안전 margin 위해 60s.
export const maxDuration = 60;

const MINISTRY = "전라남도 순천시"; // press_ingest 가 시·군 단위 인식
const SOURCE_OUTLET = "순천시청";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) return null;
  return user;
}

export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit ?? 10), 1), 30);

  let items;
  try {
    items = await fetchSuncheonRecent(limit);
  } catch (e) {
    return NextResponse.json(
      { error: `fetch 실패: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of items) {
    if (!item.body) {
      skipped += 1;
      continue;
    }
    const { error } = await admin.from("news_posts").insert({
      title: item.title.slice(0, 500),
      summary: item.body.slice(0, 500),
      body: item.body.slice(0, 20000),
      source_url: item.sourceUrl,
      source_outlet: SOURCE_OUTLET,
      ministry: MINISTRY,
      published_at: now,
      classified_at: null, // press_ingest cron 이 분류
    });
    if (error) {
      // UNIQUE 위반 = 이미 수집된 row
      if (error.code === "23505") {
        skipped += 1;
      } else {
        errors.push(`seq=${item.seq}: ${error.message}`);
      }
    } else {
      inserted += 1;
    }
  }

  await logAdminAction({
    actorId: user.id,
    action: "local_press_scrape",
    details: {
      city: "순천시",
      ministry: MINISTRY,
      fetched: items.length,
      inserted,
      skipped,
      errors: errors.slice(0, 3),
    },
  });

  return NextResponse.json({
    ok: true,
    city: "순천시",
    fetched: items.length,
    inserted,
    skipped,
    errors: errors.slice(0, 3),
  });
}
