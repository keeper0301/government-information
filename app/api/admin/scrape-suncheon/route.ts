// ============================================================
// /api/admin/scrape-suncheon — 순천시청 보도자료 수동 수집 endpoint
// ============================================================
// 사장님이 어드민에서 1 클릭 호출. cron 외 임시 수집 검증용.
//
// POST body: { limit?: number } (기본 10건, 최대 30건)
//
// 실행 로직은 lib/scraping/local-press/suncheon.scrapeSuncheonAndInsert
// 에서 공유 — cron endpoint 와 동일 path.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/admin-auth-server";
import { scrapeSuncheonAndInsert } from "@/lib/scraping/local-press/suncheon";
import { logAdminAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit ?? 10), 1), 30);

  let result;
  try {
    result = await scrapeSuncheonAndInsert(createAdminClient(), limit);
  } catch (e) {
    return NextResponse.json(
      { error: `fetch 실패: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  await logAdminAction({
    actorId: user.id,
    action: "local_press_scrape",
    details: {
      ministry: "전라남도 순천시",
      trigger: "admin_manual",
      ...result,
    },
  });

  return NextResponse.json({ ok: true, ...result });
}
