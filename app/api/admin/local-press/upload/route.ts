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
import { PC_RUNNER_CFGS } from "@/lib/scraping/local-press/_pc_runner_cfgs";
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

  // PC_RUNNER_CFGS 에 등록된 city_key 만 처리. seoul 은 다른 type 으로 다음 commit.
  for (const item of body.items) {
    const cfg = PC_RUNNER_CFGS[item.city_key];
    if (!cfg) {
      results.push({
        city: item.city_key,
        fetched: 0,
        inserted: 0,
        skipped: 0,
        errors: [`unsupported city_key (PC_RUNNER_CFGS): ${item.city_key}`],
      });
      continue;
    }

    try {
      const r = await processProvidedHtml(
        cfg,
        admin,
        item.list_html,
        item.detail_htmls,
      );
      results.push(r);
    } catch (e) {
      results.push({
        city: cfg.cityName,
        fetched: 0,
        inserted: 0,
        skipped: 0,
        errors: [`processProvidedHtml: ${(e as Error).message}`],
      });
    }
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
