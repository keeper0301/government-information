// ============================================================
// LLM 기반 보강 API — description → 구조화 필드 (welfare · loan 공용)
// ============================================================
// 기존 /api/enrich 는 data.go.kr 공식 API 전용 (welfare 중 serv_id 있는 것만).
// 이 엔드포인트는 description 이 있지만 세부 필드가 NULL 인 공고를
// Gemini 로 보강. 15개 소스 개별 스크래퍼 확장을 대체.
//
// 실행 제약
//   - Vercel Hobby 한도: 60초
//   - Gemini 무료 티어: 분당 15회 → 호출 사이 3~4초 간격 필요
//   - 배치 크기: welfare 5 + loan 5 = 최대 10건/실행 (여유있게 40초 내)
//   - 매일 cron → 일 10건 × 365 = 3,650건/년 무료 커버
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCronFailure } from "@/lib/email";
import { extractFieldsFromText } from "@/lib/ai-extract";

export const maxDuration = 60;

// 한 번에 처리할 후보 수 (양쪽 테이블 합쳐 40초 이내 여유)
const WELFARE_BATCH = 5;
const LOAN_BATCH = 5;
// Gemini 분당 15회 제한 준수용 호출 간격 (15회/60초 = 4초/회)
const RATE_LIMIT_DELAY_MS = 4000;
// description 이 너무 짧으면 추출할 정보 없음 → 스킵
const MIN_DESCRIPTION_LEN = 80;

type AdminClient = ReturnType<typeof createAdminClient>;

type EnrichRow = {
  id: string;
  title: string;
  description: string | null;
};

// 1건 보강: Gemini 호출 → DB update
// 반환 true=성공, false=스킵 또는 실패
async function enrichOne(
  supabase: AdminClient,
  table: "welfare_programs" | "loan_programs",
  row: EnrichRow,
): Promise<boolean> {
  if (!row.description || row.description.length < MIN_DESCRIPTION_LEN) {
    // 본문 부족 — 그래도 last_llm_enriched_at 은 찍어서 다음 주기까지 재시도 방지
    await supabase
      .from(table)
      .update({ last_llm_enriched_at: new Date().toISOString() })
      .eq("id", row.id);
    return false;
  }

  const type = table === "welfare_programs" ? "welfare" : "loan";
  try {
    const extracted = await extractFieldsFromText(row.title, row.description, type);

    // 추출된 값만 선택적으로 업데이트 (빈 값은 기존 유지).
    // 기존 값이 있는 필드도 새 값이 있으면 덮어씀 — LLM 추출이 보통 더 정제됨.
    // (원치 않으면 if (!existingRow.field) 체크로 변경 가능)
    const update: Record<string, unknown> = {
      last_llm_enriched_at: new Date().toISOString(),
    };
    if (extracted.eligibility) update.eligibility = extracted.eligibility;
    if (extracted.apply_method) update.apply_method = extracted.apply_method;
    if (extracted.required_documents) update.required_documents = extracted.required_documents;

    if (table === "welfare_programs") {
      if (extracted.benefits) update.benefits = extracted.benefits;
    } else {
      // loan 전용 필드
      if (extracted.loan_amount) update.loan_amount = extracted.loan_amount;
      if (extracted.interest_rate) update.interest_rate = extracted.interest_rate;
      if (extracted.repayment_period) update.repayment_period = extracted.repayment_period;
    }

    const { error } = await supabase.from(table).update(update).eq("id", row.id);
    if (error) {
      console.error(`[enrich-llm] ${table} ${row.id} update 실패:`, error);
      return false;
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[enrich-llm] ${table} ${row.id} Gemini 실패:`, msg);
    // 실패해도 타임스탬프 찍어서 무한 재시도 방지
    await supabase
      .from(table)
      .update({ last_llm_enriched_at: new Date().toISOString() })
      .eq("id", row.id);
    return false;
  }
}

// 후보 조회 + 순차 처리
async function runEnrichAndRespond(jobLabel: string) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not set", enriched: 0 },
        { status: 503 },
      );
    }

    const supabase = createAdminClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 후보: description 있음 + 핵심 필드 중 하나라도 NULL + 7일 내 보강 안 한 것
    // PostgREST .or() 는 같은 쿼리 내 여러 번 호출하면 AND 결합 → 아래 2개 or 가
    // 모두 만족하는 row 만 가져옴.
    const [welfareRes, loanRes] = await Promise.all([
      supabase
        .from("welfare_programs")
        .select("id, title, description")
        .not("description", "is", null)
        .or(`last_llm_enriched_at.is.null,last_llm_enriched_at.lt.${sevenDaysAgo}`)
        .or("eligibility.is.null,benefits.is.null,apply_method.is.null")
        .order("last_llm_enriched_at", { ascending: true, nullsFirst: true })
        .limit(WELFARE_BATCH),
      supabase
        .from("loan_programs")
        .select("id, title, description")
        .not("description", "is", null)
        .or(`last_llm_enriched_at.is.null,last_llm_enriched_at.lt.${sevenDaysAgo}`)
        .or("eligibility.is.null,loan_amount.is.null,apply_method.is.null")
        .order("last_llm_enriched_at", { ascending: true, nullsFirst: true })
        .limit(LOAN_BATCH),
    ]);

    const welfareRows = (welfareRes.data ?? []) as EnrichRow[];
    const loanRows = (loanRes.data ?? []) as EnrichRow[];

    let enriched = 0;
    let failed = 0;

    // 순차 처리 — 호출 사이 4초 간격 (Gemini 분당 15회 제한)
    const processRow = async (
      table: "welfare_programs" | "loan_programs",
      row: EnrichRow,
    ) => {
      const ok = await enrichOne(supabase, table, row);
      if (ok) enriched++;
      else failed++;
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
    };

    for (const row of welfareRows) await processRow("welfare_programs", row);
    for (const row of loanRows) await processRow("loan_programs", row);

    const total = welfareRows.length + loanRows.length;

    // 50% 이상 실패 시 운영자 알림 (API quota / 키 만료 감지)
    if (total > 0 && failed / total >= 0.5) {
      await notifyCronFailure(
        `${jobLabel} - LLM 보강 실패율 ${failed}/${total}`,
        `Gemini API 응답 이상. quota 초과·키 만료·description 비정상 가능성.`,
      );
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      enriched,
      failed,
      total_candidates: total,
      welfare_processed: welfareRows.length,
      loan_processed: loanRows.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    await notifyCronFailure(jobLabel, message);
    return NextResponse.json({ error: "LLM 보강 실패", detail: message }, { status: 500 });
  }
}

function checkAuth(req: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const authErr = checkAuth(request);
  if (authErr) return authErr;
  return runEnrichAndRespond("enrich-llm (POST)");
}

export async function GET(request: NextRequest) {
  const authErr = checkAuth(request);
  if (authErr) return authErr;
  return runEnrichAndRespond("enrich-llm (cron)");
}
