// ============================================================
// 매일 KST 11:30 + 14:30 + 17:30 cron — 미분류 뉴스 자동 모더레이션 분류
// ============================================================
// 매일 naver-news cron (11:00 KST) 직후 30분 이후 실행 — 신규 뉴스 자동 분류.
// LLM (Claude Haiku) 으로 광고성·저작권 위반 의심 자동 판별 → 자동 hide.
// 사장님 부담 (어드민 매번 검수) 큰 폭 감소.
//
// 안전 가드:
//   - cap 30/cron — Anthropic rate limit + 비용 통제
//   - confidence 0.7 이상만 자동 hide (애매한 글은 visible 유지)
//   - 사장님이 visible 결정한 글은 classified_at 채워져 재분류 안 됨
//   - 분류 실패 시 errors 누적, 다른 글 처리 계속
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifyNewsForModeration,
  decideAutoModeration,
} from "@/lib/news/classify";
import { logAdminAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CAP_PER_CRON = 30;

async function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

type ClassifyResult = {
  fetched: number;
  classified: number;
  auto_hidden: number;
  kept: number;
  failed: number;
  errors: string[];
};

async function run(): Promise<NextResponse> {
  const result: ClassifyResult = {
    fetched: 0,
    classified: 0,
    auto_hidden: 0,
    kept: 0,
    failed: 0,
    errors: [],
  };

  const admin = createAdminClient();

  // 1) 미분류 + visible 인 뉴스만 fetch (cap 만큼)
  const { data, error } = await admin
    .from("news_posts")
    .select("id, title, body, source_outlet")
    .is("classified_at", null)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(CAP_PER_CRON);

  if (error) {
    return NextResponse.json(
      { ok: false, error: `미분류 뉴스 조회 실패: ${error.message}` },
      { status: 500 },
    );
  }

  const newsRows = (data ?? []) as Array<{
    id: string;
    title: string;
    body: string | null;
    source_outlet: string | null;
  }>;
  result.fetched = newsRows.length;

  // 2) 각 뉴스별 LLM 분류 + DB update (순차 — Anthropic rate limit 보호)
  for (const news of newsRows) {
    try {
      const classification = await classifyNewsForModeration({
        title: news.title,
        source: news.source_outlet,
        body: news.body,
      });
      const decision = decideAutoModeration(classification);
      const now = new Date().toISOString();

      if (decision.action === "hide") {
        // 자동 hide: is_hidden=true + hidden_reason + classified_at
        const { error: updateErr } = await admin
          .from("news_posts")
          .update({
            is_hidden: true,
            hidden_at: now,
            hidden_by: null, // system 자동
            hidden_reason: decision.reason,
            classified_at: now,
            auto_classify_reason: classification.reason,
          })
          .eq("id", news.id);
        if (updateErr) throw new Error(`update 실패: ${updateErr.message}`);
        result.auto_hidden += 1;

        // 감사 로그 — 자동 분류 결정 추적
        try {
          await logAdminAction({
            actorId: null, // system
            action: "news_auto_hide",
            details: {
              news_id: news.id,
              title: news.title,
              reason: decision.reason,
              confidence: classification.confidence,
              advertorial: classification.is_advertorial,
              copyright_risk: classification.is_copyright_risk,
            },
          });
        } catch {
          // 감사 로그 실패는 분류 자체 실패 아님
        }
      } else {
        // visible 유지: classified_at 만 update (재분류 방지)
        const { error: updateErr } = await admin
          .from("news_posts")
          .update({
            classified_at: now,
            auto_classify_reason: classification.reason,
          })
          .eq("id", news.id);
        if (updateErr) throw new Error(`update 실패: ${updateErr.message}`);
        result.kept += 1;
      }
      result.classified += 1;
    } catch (e) {
      result.failed += 1;
      const message = (e as Error).message;
      result.errors.push(`[${news.id}] ${message.slice(0, 200)}`);
    }
  }

  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}

// POST 도 같은 동작 (수동 trigger 편의)
export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}
