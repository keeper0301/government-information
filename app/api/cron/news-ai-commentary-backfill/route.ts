// ============================================================
// /api/cron/news-ai-commentary-backfill — 신규 news 자체 해설 백필 (P2)
// ============================================================
// news_posts.ai_commentary IS NULL row 를 매일 채워 NewsCommentaryBox 가 항상
// 자체 콘텐츠를 노출하게 한다. AdSense "scaled content" 정책 방어 + selective
// noindex 해제 후보 확장 (isThin = !ai_commentary 해소).
//
// 스케줄: 매시간 :30 (vercel.json "30 * * * *"). 초기 KST 04:30 하루 1회였으나
//   backlog catch-up 위해 매시간으로 전환(commit 89a759a, 10%→80%).
// 처리량: news 100건/run (BATCH_CAP) × 시간당 = backlog 빠른 소진.
// LLM: gpt-4o-mini (lib/news/ai-commentary.ts generateNewsCommentary, throw-safe).
// graceful: OPENAI_API_KEY 미설정 시 안전 skip.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateNewsCommentary } from "@/lib/news/ai-commentary";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { sendOpsAlertTelegram } from "@/lib/notifications/telegram-ops-alert";

export const dynamic = "force-dynamic";
// 5분 cap — 200건 / CHUNK 10 = 20 chunk × ~5s ≈ 100~200s. 정책 백필과 동일 규모.
export const maxDuration = 300;

// 2026-05-31 — 리뷰어 Major 3 권고 적용. BATCH 200/CHUNK 10 = 20 chunk × 50초 = 1000초 →
// 300초 cap 초과 + OpenAI 동시 10 호출 rate limit 위험. BATCH 100/CHUNK 5 = 20 chunk × 25초
// = 500초 → 안전 마진. backlog 누적 시 cron schedule 분산(매일 04:30 + 16:30) 검토.
const BATCH_CAP = 100;
const CHUNK = 5;

type NewsRow = {
  id: string;
  title: string;
  summary: string | null;
  body: string;
  category: string | null;
  keywords: string[] | null;
};

type BackfillResult = {
  fetched: number;
  updated: number;
  // LLM 성공했지만 sanitize 실패해 "" sentinel 로 채워진 row (영구 미백필).
  // hub commentaryBackfillRatio 가 영원히 100% 못 가는 원인 가시화 (Major 2).
  sentinel_filled: number;
  llm_failed: number;
  update_failed: number;
};

async function backfill(limit: number): Promise<BackfillResult> {
  const admin = createAdminClient();
  // 백필 대상: ai_commentary NULL + 분류 완료 (classified_at·summary 있음 = 가치 row).
  // press 카테고리 제외 (기존 비노출 정책). 인기 글 우선 (검수자 hit 확률 ↑).
  const { data: rows, error } = await admin
    .from("news_posts")
    .select("id, title, summary, body, category, keywords")
    .is("ai_commentary", null)
    .neq("category", "press")
    .not("summary", "is", null)
    .not("classified_at", "is", null)
    .not("body", "is", null)
    .order("view_count", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.warn(`[news-ai-commentary] select 실패:`, error.message);
    return { fetched: 0, updated: 0, sentinel_filled: 0, llm_failed: 0, update_failed: 0 };
  }
  if (!rows || rows.length === 0) {
    return { fetched: 0, updated: 0, sentinel_filled: 0, llm_failed: 0, update_failed: 0 };
  }

  let updated = 0;
  let sentinelFilled = 0;
  let llmFailed = 0;
  let updateFailed = 0;
  const list = rows as NewsRow[];
  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK);
    // 각 row try/catch 격리 — 일시 네트워크 예외가 Promise.all 전체 reject 시켜
    // 백필 중단되는 사고 방지 (정책 백필 1차 247건 크래시 교훈).
    await Promise.all(
      chunk.map(async (row) => {
        try {
          const result = await generateNewsCommentary({
            title: row.title,
            summary: row.summary,
            body: row.body,
            category: row.category,
            keywords: row.keywords,
          });
          // LLM 일시 실패 → sentinel 안 함 → 다음날 재시도.
          if (!result.llmOk) {
            llmFailed += 1;
            return;
          }
          // LLM 성공 → null/sanitize 실패 시 "" sentinel (부적합 row 매일 재과금 차단).
          // NewsCommentaryBox 는 "" falsy 로 보고 미표시.
          const value = result.commentary ?? "";
          const isSentinel = value === "";
          const { error: upErr } = await admin
            .from("news_posts")
            .update({ ai_commentary: value })
            .eq("id", row.id);
          if (upErr) {
            updateFailed += 1;
            console.error(
              `[news-ai-commentary] ${row.id} update 실패:`,
              upErr.message,
            );
          } else {
            updated += 1;
            if (isSentinel) sentinelFilled += 1;
          }
        } catch (e) {
          updateFailed += 1;
          console.error(
            `[news-ai-commentary] ${row.id} 예외:`,
            (e as Error).message,
          );
        }
      }),
    );
  }
  return {
    fetched: list.length,
    updated,
    sentinel_filled: sentinelFilled,
    llm_failed: llmFailed,
    update_failed: updateFailed,
  };
}

async function run() {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: true, skipped: "OPENAI_API_KEY missing" });
  }
  const result = await backfill(BATCH_CAP);
  const payload = { ok: true, ...result };
  console.log("[news-ai-commentary] 결과:", JSON.stringify(payload));

  // 실패율 50%+ 일 때만 텔레그램 — 정상 성공·일시 1건 타임아웃은 조용.
  // 매시간 cron 이라 매 성공(updated>0) 알림은 24/일 노이즈. daily→매시간 전환
  // (commit 89a759a) 후 성공 알림이 24배가 된 부작용 보정. 옆 cron(enrich)의
  // "실패율 50%+" 알림과 같은 취지(분모는 여기선 fetched 전체 — 이 cron엔
  // no_fetcher/no_data 범주가 없음). OpenAI 키 무효·할당량 소진 등 진짜 장애만 감지.
  const totalFailed = result.llm_failed + result.update_failed;
  if (result.fetched > 0 && totalFailed / result.fetched >= 0.5) {
    const lines = [
      `news 자체 해설 백필 실패율 ${totalFailed}/${result.fetched} (AI ${result.llm_failed} / 저장 ${result.update_failed})`,
      `OpenAI 키·할당량 또는 DB 이상 가능성 — 점검 권장.`,
    ];
    try {
      await sendOpsAlertTelegram({
        subject: "뉴스 AI 자체 해설 백필 — 실패율 경고",
        message: lines.join("\n"),
      });
    } catch {
      // 알림 실패가 cron 을 깨지 않게.
    }
  }
  return NextResponse.json(payload);
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}

// 수동 trigger (어드민 cron-trigger 페이지)
export async function POST(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}
