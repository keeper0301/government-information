// 미분류 뉴스 자동 모더레이션 cron (6회/일 KST 10:30~20:30 매 2시간).
// LLM (OpenAI gpt-4o-mini) 으로 광고성·저작권 의심 자동 판별 → confidence 0.7+ 자동 hide.
// 안전: cap 200 + 동시 5 batch + classified_at 채워진 글 재분류 안 됨.
// oldest-first (ASC) — 14k backlog 우선 흡수, 신규 ~245/일 < 1,200/일 수용량.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifyNewsForModeration,
  decideAutoModeration,
} from "@/lib/news/classify";
import { logAdminAction } from "@/lib/admin-actions";
import { NEWS_CLASSIFY_CAP_PER_CRON } from "@/lib/news-classify-config";

export const dynamic = "force-dynamic";
// cap 200 × 평균 3초/건 ÷ 동시 5 = ~120초. maxDuration 600초 = 5x margin.
export const maxDuration = 600;

const CAP_PER_CRON = NEWS_CLASSIFY_CAP_PER_CRON;
// 동시 호출 수 — Anthropic Tier 별 rate limit 고려해 보수적 5. 24h 모니터링 후 조정 가능.
const CONCURRENCY = 5;

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

type NewsRow = {
  id: string;
  title: string;
  body: string | null;
  source_outlet: string | null;
};

// 단일 뉴스 1건 처리 — chunk 동시 호출 대상. 실패해도 throw 하지 않고 result 에 누적.
async function classifyOne(
  news: NewsRow,
  admin: ReturnType<typeof createAdminClient>,
  result: ClassifyResult,
): Promise<void> {
  try {
    const classification = await classifyNewsForModeration({
      title: news.title,
      source: news.source_outlet,
      body: news.body,
    });
    const decision = decideAutoModeration(classification);
    const now = new Date().toISOString();

    if (decision.action === "hide") {
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
      // 감사 로그 (실패 무시) — 자동 분류 결정 추적
      try {
        await logAdminAction({
          actorId: null,
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
      } catch {}
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
    if (result.errors.length < 50) {
      // errors cap 50 — 200건 처리 시 response 크기 폭주 방지
      result.errors.push(`[${news.id}] ${message.slice(0, 200)}`);
    }
  }
}

async function run(): Promise<NextResponse> {
  // duration_ms 측정 — cap 미달 처리 (timeout 추정) 진단용
  const startMs = Date.now();
  const result: ClassifyResult = {
    fetched: 0,
    classified: 0,
    auto_hidden: 0,
    kept: 0,
    failed: 0,
    errors: [],
  };

  const admin = createAdminClient();

  // 1) 미분류 + visible 인 뉴스만 fetch (oldest-first — 14k backlog 우선 흡수)
  //    신규 ~245건/일 < cap 200/cron × 6회 = 1,200/일 이라 lag 사실상 안 생김.
  const { data, error } = await admin
    .from("news_posts")
    .select("id, title, body, source_outlet")
    .is("classified_at", null)
    .eq("is_hidden", false)
    .order("created_at", { ascending: true })
    .limit(CAP_PER_CRON);

  if (error) {
    return NextResponse.json(
      { ok: false, error: `미분류 뉴스 조회 실패: ${error.message}` },
      { status: 500 },
    );
  }

  const newsRows = (data ?? []) as NewsRow[];
  result.fetched = newsRows.length;

  // 2) chunk (CONCURRENCY 단위) 동시 호출. JS single-thread → result mutation 안전.
  //    chunk 단위로 끊어 처리해 한 chunk 의 가장 느린 요청만큼만 다음 chunk 가 대기.
  for (let i = 0; i < newsRows.length; i += CONCURRENCY) {
    const chunk = newsRows.slice(i, i + CONCURRENCY);
    await Promise.allSettled(chunk.map((news) => classifyOne(news, admin, result)));
  }

  // cron run 통계 audit — 매 실행마다 1건. cap 미달 (fetched < CAP_PER_CRON) +
  // 짧은 duration 이면 backlog 소진, 긴 duration 이면 LLM timeout 추정.
  const durationMs = Date.now() - startMs;
  try {
    await logAdminAction({
      actorId: null, // system
      action: "news_classify_run",
      details: {
        cap: CAP_PER_CRON,
        fetched: result.fetched,
        classified: result.classified,
        auto_hidden: result.auto_hidden,
        kept: result.kept,
        failed: result.failed,
        errors_truncated: result.failed > result.errors.length,
        duration_ms: durationMs,
      },
    });
  } catch {
    // audit 실패는 cron 자체 실패 아님 (조용히 무시)
  }

  return NextResponse.json({ ok: true, duration_ms: durationMs, ...result });
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
