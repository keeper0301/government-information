// ============================================================
// /api/cron/policy-insight-backfill — 정책 자체 해설 백필 (AdSense 큐레이션 시그널)
// ============================================================
// 2026-05-10 AdSense "thin/scaled content" 거절 대응. 정부 원문(description) 외에
// keepioo 자체 5~7줄 해설을 unique_insight 컬럼에 자동 저장.
//
// cron 2시간마다 12회/일 (vercel.json "0 */2 * * *").
// LLM: gpt-4o-mini (callLLM 추상화). 정책당 ~400 토큰.
// AdSense 색인 가속 위해 1회/일 → 4회/일(5/11) → 현재 2시간마다 12회/일.
// 2026-06-03 — loan eligible(desc≥50 & insight NULL) 0건 = 사실상 완료(129 NULL 전부 sparse).
// loan slot 50 이 매 cron 통째 낭비되던 것을 welfare 로 재배분: welfare 50→100, loan 50→10.
// welfare eligible 5,005건 → 100×12회=1,200/일 ≈ 4일(기존 50×12=600/일 ≈ 8일). loan 10 미래 신규 안전망.
//
// graceful: OPENAI_API_KEY 미설정 / DDL 083 미적용 시 안전 skip.
// description < 50자 (sparse) 정책은 백필 안 함 — 해설 만들어도 thin.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callLLM } from "@/lib/llm/text";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5분 — 100건 × 1~2s = 100~200s

const WELFARE_CAP = 100; // welfare eligible 5,005 남음 → 집중(maxDuration 내 ~200s)
const LOAN_CAP = 10;     // loan eligible 0(완료) → 미래 신규 정책 안전망만
// welfare 90% sparse (desc<50자) → fetch 50건 = 1건만 처리되는 사고 보정.
// fetch 단계에서 description 길이 필터를 못 걸어서 client filter 후 50건만 LLM.
// 5/17 진단: cron당 0~1건만 update → 5/24까지 100% 도달 불가. 10x fetch 로 cron당 25건 목표.
const FETCH_MULTIPLIER = 10;
const MIN_DESC_LEN = 50;        // sparse 정책 skip
const MIN_INSIGHT_LEN = 80;     // LLM 응답 너무 짧으면 skip
const MAX_DESC_PROMPT_LEN = 1500; // 토큰 cap (description 자르기)
const MODEL = "gpt-4o-mini";

const PROMPT_TEMPLATE = `다음 정부 정책에 대해 keepioo 사용자가 빠르게 핵심을 잡을 수 있도록 5~7줄 해설을 작성해 주세요.

[정책 데이터]
제목: {{TITLE}}
출처: {{SOURCE}}
본문: {{DESCRIPTION}}

[요청]
다음 4 관점을 각 1~2줄씩 자연스럽게 풀어 주세요. 마크다운·번호·이모지 사용 금지, 줄바꿈으로만 구분, 전체 200~400자 한국어.

1. 핵심 한 줄 정의 ("이 정책은 ~~한 사람에게 ~~을 지원하는 제도입니다" 형식)
2. 받기 좋은 사람 (구체 대상층 1~2가지 — 나이·소득·상황)
3. 신청 시 놓치기 쉬운 점 (서류·기간·중복 수령·자격 함정 중 1가지)
4. 더 알아두면 좋은 점 (관련 정책·실무 팁·주의사항 중 1가지)

원문 본문을 그대로 옮기지 말고 keepioo 자체 정리·해설로 작성해 주세요.`;

type PolicyRow = {
  id: string;
  title: string;
  source: string | null;
  description: string | null;
};

type BackfillResult = {
  table: string;
  fetched: number;
  skipped_short: number;
  skipped_llm_short: number;
  llm_failed: number;
  updated: number;
};

async function backfillTable(
  table: "welfare_programs" | "loan_programs",
  limit: number,
): Promise<BackfillResult> {
  const admin = createAdminClient();
  const result: BackfillResult = {
    table,
    fetched: 0,
    skipped_short: 0,
    skipped_llm_short: 0,
    llm_failed: 0,
    updated: 0,
  };

  // unique_insight NULL 인 row 만 (partial index 활용).
  // 우선순위: view_count DESC (인기 정책 — 검수자 hit 확률 ↑) → published_at DESC (cold start 는 최신 우선).
  // welfare_programs / loan_programs 둘 다 view_count + published_at 보유 (2026-05-11 확인).
  // FETCH_MULTIPLIER 만큼 over-fetch 후 client side 에서 sparse(desc<50자) 미리 제외.
  // 그래야 limit 50 일 때 LLM 처리 가능한 50건이 실제로 확보됨 (5/17 사고 보정).
  const { data: rows, error } = await admin
    .from(table)
    .select("id, title, source, description")
    .is("unique_insight", null)
    .order("view_count", { ascending: false, nullsFirst: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit * FETCH_MULTIPLIER);

  if (error) {
    // DDL 083 미적용 환경에서는 unique_insight 컬럼 없음 → 정상 graceful skip.
    // 운영 진단성 위해 한 줄 로그 — Vercel function logs 에서 원인 즉시 파악.
    console.warn(`[insight-backfill] ${table} select 실패 (DDL 083 미적용 가능):`, error.message);
    return { ...result, llm_failed: 0 };
  }
  if (!rows || rows.length === 0) return result;

  // sparse 정책 client filter 후 상위 limit 건만 LLM 호출.
  const eligible: PolicyRow[] = [];
  for (const row of rows as PolicyRow[]) {
    const desc = row.description?.trim();
    if (!desc || desc.length < MIN_DESC_LEN) {
      result.skipped_short++;
      continue;
    }
    eligible.push(row);
    if (eligible.length >= limit) break;
  }
  result.fetched = eligible.length;

  for (const row of eligible) {
    const desc = row.description!.trim();

    const prompt = PROMPT_TEMPLATE
      .replace("{{TITLE}}", row.title)
      .replace("{{SOURCE}}", row.source ?? "정부 공식")
      .replace("{{DESCRIPTION}}", desc.slice(0, MAX_DESC_PROMPT_LEN));

    let insight: string;
    try {
      const raw = await callLLM({ prompt, maxTokens: 600, model: MODEL });
      insight = raw.trim();
    } catch (e) {
      console.error(`[insight-backfill] ${table}/${row.id} LLM 실패:`, (e as Error).message);
      result.llm_failed++;
      continue;
    }

    if (insight.length < MIN_INSIGHT_LEN) {
      result.skipped_llm_short++;
      continue;
    }

    const { error: updateErr } = await admin
      .from(table)
      .update({
        unique_insight: insight,
        unique_insight_at: new Date().toISOString(),
        unique_insight_model: MODEL,
      })
      .eq("id", row.id);

    if (updateErr) {
      console.error(`[insight-backfill] ${table}/${row.id} update 실패:`, updateErr);
      result.llm_failed++;
    } else {
      result.updated++;
    }
  }

  return result;
}

async function run() {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      ok: true,
      skipped: "OPENAI_API_KEY missing",
    });
  }

  const [welfare, loan] = await Promise.all([
    backfillTable("welfare_programs", WELFARE_CAP),
    backfillTable("loan_programs", LOAN_CAP),
  ]);

  const totalUpdated = welfare.updated + loan.updated;
  return NextResponse.json({
    ok: true,
    total_updated: totalUpdated,
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
