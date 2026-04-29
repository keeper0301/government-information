// ============================================================
// enrich-targeting cron route
// ============================================================
// Phase 1.5: welfare/loan 정책 본문 분석 → income/household target 컬럼 채움
// - cron 호출: 매일 1회 자동, 100건/회
// - backfill 옵션: ?backfill=1&batch=1000 (admin 수동 trigger 용)
// - 처리 대상: last_targeting_analyzed_at IS NULL OR < updated_at
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractTargeting } from '@/lib/personalization/targeting-extract';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Pro: 함수 최대 60초

// 처리할 테이블 목록
const TABLES = ['welfare_programs', 'loan_programs'] as const;
type TableName = typeof TABLES[number];

// 한 테이블에서 미처리 행을 batchSize 개 가져와 targeting 분석 후 업데이트
async function processTable(
  supabase: ReturnType<typeof createAdminClient>,
  table: TableName,
  batchSize: number,
): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  // 미처리 행 조회:
  // - last_targeting_analyzed_at 이 NULL (한 번도 분석 안 됨)
  // - OR last_targeting_analyzed_at < updated_at (정책이 갱신됐는데 재분석 안 됨)
  const { data: rows, error: selectError } = await supabase
    .from(table)
    .select('id, title, description, eligibility, detailed_content, updated_at')
    .or('last_targeting_analyzed_at.is.null,last_targeting_analyzed_at.lt.updated_at')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(batchSize);

  if (selectError) {
    console.error(`[enrich-targeting] ${table} 조회 오류:`, selectError);
    return { processed: 0, errors: 1 };
  }

  // 각 행의 텍스트를 합쳐서 targeting 분석 실행
  for (const row of rows ?? []) {
    const haystack = [row.title, row.description, row.eligibility, row.detailed_content]
      .filter(Boolean)
      .join(' ');
    const { income_target_level, household_target_tags } = extractTargeting(haystack);

    const { error: updateError } = await supabase
      .from(table)
      .update({
        income_target_level,
        household_target_tags,
        last_targeting_analyzed_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (updateError) {
      console.error(`[enrich-targeting] ${table} 업데이트 실패 id=${row.id}:`, updateError);
      errors++;
    } else {
      processed++;
    }
  }

  return { processed, errors };
}

// GET /api/enrich-targeting
// - Vercel cron 이 Bearer CRON_SECRET 헤더를 달고 매일 08:00 UTC 에 호출
// - 관리자가 수동으로 ?backfill=1&batch=1000 파라미터로 호출 가능
export async function GET(request: NextRequest) {
  // CRON_SECRET 검증 — cron 또는 admin 만 접근 가능
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET 미설정' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const isBackfill = url.searchParams.get('backfill') === '1';
  // backfill 모드: 최대 2000건, 기본 1000건 / cron 모드: 100건
  const batchSize = isBackfill
    ? Math.min(parseInt(url.searchParams.get('batch') ?? '1000', 10), 2000)
    : 100;

  // createAdminClient 는 동기(sync) 함수 — await 없이 호출
  const supabase = createAdminClient();

  // 테이블별 처리 결과 수집
  const stats: Record<TableName, { processed: number; errors: number }> = {
    welfare_programs: { processed: 0, errors: 0 },
    loan_programs: { processed: 0, errors: 0 },
  };

  for (const table of TABLES) {
    stats[table] = await processTable(supabase, table, batchSize);
  }

  return NextResponse.json({
    ok: true,
    mode: isBackfill ? 'backfill' : 'cron',
    batchSize,
    stats,
  });
}

// /admin/cron-trigger 의 self-POST 호환 (cron 자동 호출은 GET 으로 들어옴).
export const POST = GET;
