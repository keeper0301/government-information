// app/admin/news/backfill-dedupe/route.ts
// 기존 news_posts row 의 dedupe_hash 백필 endpoint (Phase 5).
//
// 마이그레이션 065 적용 후 dedupe_hash 가 NULL 인 기존 row (~13,000건) 을
// admin 본인이 수동 trigger 로 채움.
//
// 사용법: GET /admin/news/backfill-dedupe?limit=1000
// 응답: { updated: N, remaining: M, message: "..." }
// remaining > 0 면 다시 호출. 0 이면 완료.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { computeDedupeHash } from "@/lib/news-dedupe";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // admin 가드 — 본인만 접근 가능
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  // default 200 — Vercel 60s timeout 안전 (1 row UPDATE ~30~80ms × 200 = 6~16초).
  // limit 1000+ 은 timeout 위험. 사장님이 큰 batch 원하면 query string 으로 명시.
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? "200"), 1),
    2000,
  );

  const admin = createAdminClient();

  // dedupe_hash NULL row 조회
  const { data: rows, error: selectError } = await admin
    .from("news_posts")
    .select("id, title")
    .is("dedupe_hash", null)
    .limit(limit);

  if (selectError) {
    return NextResponse.json(
      { error: `select: ${selectError.message}` },
      { status: 500 },
    );
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({
      updated: 0,
      remaining: 0,
      message: "백필 완료 — NULL row 0",
    });
  }

  // 각 row 의 hash 계산 + UPDATE
  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    const hash = computeDedupeHash(row.title ?? "");
    if (!hash) {
      failed++;
      continue;
    }
    const { error } = await admin
      .from("news_posts")
      .update({ dedupe_hash: hash })
      .eq("id", row.id);
    if (error) failed++;
    else updated++;
  }

  // remaining count — 다시 호출 필요 여부 알리기
  const { count: remaining } = await admin
    .from("news_posts")
    .select("*", { count: "exact", head: true })
    .is("dedupe_hash", null);

  return NextResponse.json({
    updated,
    failed,
    remaining: remaining ?? 0,
    message:
      remaining && remaining > 0
        ? `다시 호출 필요 (limit=${limit} 으로 자동 반복 권장)`
        : "백필 완료",
  });
}
