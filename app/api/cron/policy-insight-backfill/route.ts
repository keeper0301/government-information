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
// maxDuration 600 = 느린 LLM 호출 누적 대비 여유(Vercel Pro fluid 한도 800 내).
// 중간 잘려도 row update 는 독립이라 손상 없음(다음 cron 이 NULL 이어받음).
export const maxDuration = 600;

// 2026-06-11 — welfare insight 57%(6,492/11,423) 정체 진단: 남은 NULL 4,930건은 전부
//   description<50자(지자체 복지 한 줄 요약). description 단독으론 backfill 불가였음.
//   ⇒ 해법: ① enrich(상세수집)가 detailed_content/eligibility/benefits 를 채우고
//          ② backfill 이 buildSourceText 로 그 컬럼들을 합산해 해설 생성(이 파일 변경).
//   지자체 복지 상세는 playwright/enrich-bokjiro.mjs(한국 IP Playwright)가 bokjiro 웹에서 수집.
//   enrich 가 진행될수록 eligible 이 늘어 CAP 150 이 다시 의미를 가진다(천장 57%→상승).
const WELFARE_CAP = 150; // enrich 가 채운 본문 합산이 ≥50 인 welfare 처리 (잔량 따라 가변)
// 2026-06-14 — loan 백필이 그동안 `benefits`(loan 에 없는 컬럼) select 로 매 run 에러 →
// graceful skip 되어 통째로 멈춰 있었음(loan 89건 eligible 정체 → noindex). select 를
// 테이블별로 분리해 복구. 정체분 빠른 소진 위해 CAP 10→30(클리어 후 신규 안전망으로 충분).
const LOAN_CAP = 30;
// welfare 90% 가 sparse (desc<50자)인데 PostgREST 로는 char_length 필터를 못 걸어
// client filter 로 거른다. 그런데 PostgREST 는 한 번에 max 1000행이라 단일 윈도우만
// fetch 하면 한계가 있다.
// 2026-06-05 진단 — view_count DESC 단일 1000행 윈도우가 인기 상위 eligible 소진 후
// 막힘: 남은 eligible(desc≥50) 4,463건이 대부분 view_count 가 낮아 윈도우(상위 1000)
// 밖이라 cron당 처리량이 5건으로 급감, 영원히 다 못 채움.
// → .range() 페이지네이션으로 eligible 을 limit 개 채울 때까지 다음 윈도우로 순회.
const PAGE_SIZE = 1000; // PostgREST 한 번에 max 1000행
const MAX_SCAN_ROWS = 12000; // insight NULL 전체(~9,300) 커버 + 여유
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
  // 2026-06-11 — enrich(상세수집)가 채우는 본문 컬럼들. description 이 짧아도(지자체 복지
  // 한 줄 요약) 이 컬럼들이 차 있으면 합산해서 해설 생성. enrich → backfill → 색인 파이프라인.
  detailed_content: string | null;
  eligibility: string | null;
  target: string | null;
  // 테이블별 고유 본문 컬럼 — welfare 는 benefits, loan 은 apply_method/loan_amount.
  // (loan 엔 benefits 컬럼이 없어 select 에 넣으면 에러 → 테이블별 select 로 분리.)
  benefits?: string | null;
  apply_method?: string | null;
  loan_amount?: string | null;
};

// 테이블별 select 컬럼 — loan 에 없는 benefits 를 넣으면 PostgREST 에러로 백필 전체가 멈춤.
const SELECT_COLS: Record<"welfare_programs" | "loan_programs", string> = {
  welfare_programs: "id, title, source, description, detailed_content, eligibility, benefits, target",
  loan_programs: "id, title, source, description, detailed_content, eligibility, apply_method, loan_amount, target",
};

// LLM 해설 입력 = description + enrich 본문 컬럼 합산(테이블별 고유 컬럼 포함). 중복 제거.
function buildSourceText(row: PolicyRow): string {
  const parts = [
    row.description,
    row.detailed_content,
    row.eligibility,
    row.benefits,
    row.apply_method,
    row.loan_amount,
    row.target,
  ]
    .map((s) => s?.trim())
    .filter((s): s is string => !!s && s.length > 0);
  // 동일 문구 중복 제거(여러 컬럼에 같은 한 줄이 복사된 경우) 후 결합.
  const seen = new Set<string>();
  const uniq = parts.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
  return uniq.join("\n").trim();
}

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
  // .order("id") tie-break 추가 — view_count/published_at 동률 시 .range() 페이지 경계가
  // 흔들려 row 가 중복·누락되는 것 방지(안정 정렬).
  // sparse(desc<50자) 는 DB 필터 불가라 client 에서 거르되, eligible 이 limit 에 못 미치면
  // 다음 1000행 윈도우로 이어 순회 (저 view_count eligible 까지 도달).
  const eligible: PolicyRow[] = [];
  for (
    let offset = 0;
    offset < MAX_SCAN_ROWS && eligible.length < limit;
    offset += PAGE_SIZE
  ) {
    const { data: rows, error } = await admin
      .from(table)
      .select(SELECT_COLS[table])
      .is("unique_insight", null)
      .order("view_count", { ascending: false, nullsFirst: false })
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      // DDL 083 미적용 환경에서는 unique_insight 컬럼 없음 → 정상 graceful skip.
      // 운영 진단성 위해 한 줄 로그 — Vercel function logs 에서 원인 즉시 파악.
      console.warn(`[insight-backfill] ${table} select 실패 (DDL 083 미적용 가능):`, error.message);
      return { ...result, llm_failed: 0 };
    }
    if (!rows || rows.length === 0) break;

    // 동적 select(SELECT_COLS[table])라 supabase 타입 추론이 풀려 unknown 경유 캐스팅.
    for (const row of rows as unknown as PolicyRow[]) {
      // description 단독이 아니라 enrich 본문 합산으로 판정 — 지자체 복지(desc 짧음+상세 채워짐) 포함.
      const sourceText = buildSourceText(row);
      if (sourceText.length < MIN_DESC_LEN) {
        result.skipped_short++;
        continue;
      }
      eligible.push(row);
      if (eligible.length >= limit) break;
    }

    if (rows.length < PAGE_SIZE) break; // 마지막 페이지 도달
  }
  result.fetched = eligible.length;

  for (const row of eligible) {
    const sourceText = buildSourceText(row);

    const prompt = PROMPT_TEMPLATE
      .replace("{{TITLE}}", row.title)
      .replace("{{SOURCE}}", row.source ?? "정부 공식")
      .replace("{{DESCRIPTION}}", sourceText.slice(0, MAX_DESC_PROMPT_LEN));

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
