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
import { safeKeyEqual } from "@/lib/safe-key-equal";

export const dynamic = "force-dynamic";
// safeKeyEqual(node:crypto) 사용 — Edge runtime 미지원이므로 명시.
export const runtime = "nodejs";
export const maxDuration = 60;

// PC runner upload body — 2 round 분기:
//   round 1: { items: [{ city_key, list_html }] } → server parse → { items: [{ city, sourceUrls }] } 반환
//   round 2: { items: [{ city_key, list_html, detail_htmls }] } → server insert → 결과 반환
type UploadItem = {
  city_key: string;
  list_html: string;
  detail_htmls?: Record<string, string>;
  runner_error?: string;
};
type UploadBody = { items: UploadItem[] };

export async function POST(req: Request) {
  const secret = process.env.PC_RUNNER_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "PC_RUNNER_SECRET 미설정" }, { status: 500 });
  }
  // 상수시간 비교 (타이밍 공격 방어, 코드리뷰 P2 2026-06-08).
  const auth = req.headers.get("authorization") || "";
  if (!safeKeyEqual(auth, `Bearer ${secret}`)) {
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
  // 2026-05-26 review nit#6: items 크기 cap (악성/실수 폭주 차단)
  if (body.items.length > 20) {
    return NextResponse.json(
      { error: `items 너무 많음 (${body.items.length}건, max 20)` },
      { status: 400 },
    );
  }

  // round 1 분기 — items 중 detail_htmls 있는 게 하나도 없으면 round1.
  // 2026-05-26 review#3 fix: some() 으로 round2 진입 (혼합 시 명시 skip).
  const isRound2 = body.items.some((i) => i.detail_htmls);
  if (!isRound2) {
    const round1Results = body.items.map((item) => {
      const cfg = PC_RUNNER_CFGS[item.city_key];
      if (!cfg) {
        return {
          city_key: item.city_key,
          error: `unsupported city_key: ${item.city_key}`,
          items: [],
        };
      }
      try {
        const list = cfg.parseListItems(item.list_html).slice(0, 10);
        return {
          city_key: item.city_key,
          city: cfg.cityName,
          items: list.map((x) => ({ seq: x.seq, sourceUrl: x.sourceUrl })),
        };
      } catch (e) {
        return {
          city_key: item.city_key,
          error: `parseListItems: ${(e as Error).message}`,
          items: [],
        };
      }
    });
    return NextResponse.json({ ok: true, phase: "round1", results: round1Results });
  }

  // round 2 — insert
  const admin = createAdminClient();
  const results: Array<{
    city: string;
    fetched: number;
    inserted: number;
    skipped: number;
    errors: string[];
  }> = [];

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
    // 2026-05-26 review#3 fix: round2 안 detail_htmls 없는 item 명시 skip (errors 폭주 방지)
    if (!item.detail_htmls) {
      results.push({
        city: cfg.cityName,
        fetched: 0,
        inserted: 0,
        skipped: 0,
        errors: ["detail_htmls 누락 — round1 만 요청한 경우 무시 (혼합 batch)"],
      });
      continue;
    }
    if (!item.list_html) {
      results.push({
        city: cfg.cityName,
        fetched: 0,
        inserted: 0,
        skipped: 0,
        errors: [
          item.runner_error
            ? `PC runner list fetch 실패 — ${item.runner_error}`
            : "PC runner list_html 비어 있음 — heartbeat only",
        ],
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
  // 2026-05-26 review#2 fix: spread 순서 — r 먼저, trigger 뒤 (미래 r.trigger 덮어쓰기 방지)
  for (const r of results) {
    await logAdminAction({
      actorId: null,
      action: "local_press_scrape",
      details: { ...r, trigger: "pc_runner" },
    });
  }

  return NextResponse.json({ ok: true, phase: "round2", results });
}
