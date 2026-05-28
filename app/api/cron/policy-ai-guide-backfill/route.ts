// ============================================================
// /api/cron/policy-ai-guide-backfill — 신규 정책 자체 가치 박스 백필
// ============================================================
// 2026-05-28 자체 콘텐츠 강화 후속. 전량 백필(12,359건)은 로컬 스크립트로 끝냈고,
// 수집 cron 이 매일 추가하는 신규 정책은 ai_tips/ai_faq/ai_checklist 가 NULL 로 남는다.
// 이 cron 이 매일 NULL row 를 채워 PolicyGuideBox 가 항상 자체 콘텐츠를 노출하게 한다.
//
// 스케줄: KST 04:15 (수집·enrich cron 모두 끝난 후) 하루 1회.
// 처리량: welfare 300 + loan 300 = 일 600건 (신규분 + 누적분 점진, idempotent).
// LLM: gpt-4o-mini (lib/policy/ai-guide.ts generatePolicyGuide, throw-safe).
// graceful: OPENAI_API_KEY 미설정 / 컬럼 미존재 시 안전 skip.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePolicyGuide } from "@/lib/policy/ai-guide";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
// 5분 — welfare 100 + loan 100 = 200건. CHUNK 10 → 20 chunk × ~5s ≈ 100~200s.
// insight-backfill 의 검증된 100/run 규모와 동일 (600/run 은 300s 초과 위험).
export const maxDuration = 300;

const BATCH_CAP_PER_TABLE = 100;
const CHUNK = 10; // OpenAI 병렬 (로컬 백필에서 검증된 안전 병렬도)

type PolicyRow = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  target: string | null;
};

type BackfillResult = {
  table: string;
  fetched: number;
  updated: number;
  llm_failed: number; // LLM 호출 자체 실패 (일시) — sentinel 안 함 → 다음날 재시도
  update_failed: number; // DB update 실패·예외
};

async function backfillTable(
  table: "welfare_programs" | "loan_programs",
  limit: number,
): Promise<BackfillResult> {
  const admin = createAdminClient();
  // 3 컬럼 중 하나라도 NULL 인 신규/미백필 row 만. 인기 정책 우선 (검수자 hit 확률 ↑).
  const { data: rows, error } = await admin
    .from(table)
    .select("id, title, description, category, target")
    .or("ai_tips.is.null,ai_faq.is.null,ai_checklist.is.null")
    .order("view_count", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.warn(`[ai-guide-backfill] ${table} select 실패:`, error.message);
    return { table, fetched: 0, updated: 0, llm_failed: 0, update_failed: 0 };
  }
  if (!rows || rows.length === 0) {
    return { table, fetched: 0, updated: 0, llm_failed: 0, update_failed: 0 };
  }

  let updated = 0;
  let llmFailed = 0;
  let updateFailed = 0;
  const list = rows as PolicyRow[];
  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK);
    // 각 row try/catch 격리 — admin.update 의 일시 네트워크 예외가 Promise.all 전체를
    // reject 시켜 백필이 중단되는 사고 방지 (로컬 백필 1차 247건 크래시 교훈).
    await Promise.all(
      chunk.map(async (row) => {
        try {
          const guide = await generatePolicyGuide({
            title: row.title,
            // welfare_programs 에 summary 컬럼 없음 → description 앞 200자 사용.
            summary: row.description ? row.description.slice(0, 200) : null,
            category: row.category,
            target: row.target,
          });
          // LLM 호출 자체 실패 (일시) → sentinel 안 함 → 다음날 재시도 대상.
          if (!guide.llmOk) {
            llmFailed += 1;
            return;
          }
          // LLM 성공 → null 컬럼은 "" sentinel 로 채운다. 다음 select(.or is.null)에서 빠져
          // 영구 부적합 row 의 매일 재과금 + partial-fill 재select 를 차단.
          // PolicyGuideBox 는 "" 를 falsy 로 보고 해당 섹션 생략 (전부 ""면 template fallback).
          const { error: upErr } = await admin
            .from(table)
            .update({
              ai_tips: guide.tips ?? "",
              ai_faq: guide.faq ?? "",
              ai_checklist: guide.checklist ?? "",
            })
            .eq("id", row.id);
          if (upErr) {
            updateFailed += 1;
            console.error(`[ai-guide-backfill] ${table}/${row.id} update 실패:`, upErr.message);
          } else {
            updated += 1;
          }
        } catch (e) {
          updateFailed += 1;
          console.error(`[ai-guide-backfill] ${table}/${row.id} 예외:`, (e as Error).message);
        }
      }),
    );
  }
  return { table, fetched: list.length, updated, llm_failed: llmFailed, update_failed: updateFailed };
}

async function run() {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: true, skipped: "OPENAI_API_KEY missing" });
  }
  // welfare → loan 순차 (동시 시 OpenAI 병렬도 2배 → rate limit 마진 확보).
  const welfare = await backfillTable("welfare_programs", BATCH_CAP_PER_TABLE);
  const loan = await backfillTable("loan_programs", BATCH_CAP_PER_TABLE);
  return NextResponse.json({
    ok: true,
    total_updated: welfare.updated + loan.updated,
    welfare,
    loan,
  });
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
