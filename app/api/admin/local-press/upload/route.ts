// ============================================================
// /api/admin/local-press/upload — PC runner POST receiver (2026-05-25)
// ============================================================
// Vercel ASN 차단 site (서울·부산·광산·강원·제주·평택) 의 사장님 PC runner 가
// 한국 IP 으로 fetch 한 HTML 을 POST. server 가 parse + insert.
//
// Bearer auth: PC_RUNNER_SECRET (Vercel env + 사장님 PC env 동일).
// audit: admin_actions action="local_press_scrape" trigger="pc_runner".
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CITY_REGISTRY } from "@/lib/scraping/local-press/_registry";
import { processProvidedHtml } from "@/lib/scraping/local-press/_factory";
import { logAdminAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// PC runner upload body — city_key 별로 list HTML + detail HTML map
type UploadItem = {
  city_key: string;
  list_html: string;
  detail_htmls: Record<string, string>;
};
type UploadBody = { items: UploadItem[] };

export async function POST(req: Request) {
  const secret = process.env.PC_RUNNER_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "PC_RUNNER_SECRET 미설정" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: UploadBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON parse 실패" }, { status: 400 });
  }
  if (!body?.items?.length) {
    return NextResponse.json({ error: "items 누락" }, { status: 400 });
  }

  const admin = createAdminClient();
  const results: Array<{ city: string; fetched: number; inserted: number; skipped: number; errors: string[] }> = [];

  // 정의된 cfg 없으면 reject. PC runner 가 잘못된 city_key 보내면 무시.
  // 등록된 city 의 collector cfg 의 parseListItems / parseDetailBody 재사용.
  for (const item of body.items) {
    const entry = CITY_REGISTRY.find((c) => c.key === item.city_key);
    if (!entry) {
      results.push({
        city: item.city_key,
        fetched: 0,
        inserted: 0,
        skipped: 0,
        errors: [`unknown city_key: ${item.city_key}`],
      });
      continue;
    }

    // PC runner upload 의 사용 인터페이스 — collector cfg 가 fn 만 export 하므로
    // parseListItems / parseDetailBody 직접 접근 안 됨. 별도 cfg map 필요.
    // 임시 — 모든 collector 가 cfg export 안 함. 다음 commit 에서 cfg export 추가.
    results.push({
      city: entry.city,
      fetched: 0,
      inserted: 0,
      skipped: 0,
      errors: ["PC runner config export 필요 (다음 commit)"],
    });
  }

  // audit 기록
  for (const r of results) {
    await logAdminAction({
      actorId: null,
      action: "local_press_scrape",
      details: { trigger: "pc_runner", ...r },
    });
  }

  return NextResponse.json({ ok: true, results });
}
