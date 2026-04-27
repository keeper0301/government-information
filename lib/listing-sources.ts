// ============================================================
// 사이트 노출용 source_code 화이트리스트/블랙리스트
// ============================================================
// 배경 (2026-04-27 발견):
//   welfare 1211건 (youth-v1 1168 + legacy 43) + loan 307건 (legacy)
//   = 1518건이 4일 이상 fresh 안 되는 stale 데이터.
//   collector 폐기 후 영원히 fetched_at 갱신 0, last_detail_fetched_at NULL
//   99%, apply_end NULL → cleanup-expired-programs cron 도 못 정리.
//   사용자가 클릭 → 빈 카드 + 마감 정보 0 → 실망.
//
// 정책:
//   사용자 노출 페이지(목록·상세·sitemap·검색·추천·블로그 발행 등) 는
//   EXCLUDED 에 들어 있는 source_code 를 자동 제외.
//   admin/cron/enrich/cleanup 페이지는 그대로 — 운영 가시성 보존.
//
// 향후 재활성화:
//   youth-v2 collector 가 youth-v1 데이터 대체했을 때, 또는
//   legacy 데이터에 대한 새 enrich 파이프라인이 생겼을 때
//   해당 항목을 EXCLUDED 에서 제거.
// ============================================================

/** welfare_programs 사용자 노출 시 제외할 source_code */
export const WELFARE_LISTING_EXCLUDED_SOURCES = [
  "youth-v1",   // youth-v2 가 대체. 기존 1168건 영원히 stale.
  "legacy",     // collector 폐기. 43건 영원히 stale.
] as const;

/** loan_programs 사용자 노출 시 제외할 source_code */
export const LOAN_LISTING_EXCLUDED_SOURCES = [
  "legacy",     // collector 폐기. 307건 영원히 stale.
] as const;

/** PostgREST `not.in.(...)` 필터 값 — supabase-js 의 .not('source_code','in', X) 인자 */
export const WELFARE_EXCLUDED_FILTER = `(${WELFARE_LISTING_EXCLUDED_SOURCES.join(",")})`;
export const LOAN_EXCLUDED_FILTER = `(${LOAN_LISTING_EXCLUDED_SOURCES.join(",")})`;

/** ID 기반 직접 접근 시 (예: /welfare/[id]) EXCLUDED 면 notFound 처리에 사용 */
export function isExcludedWelfareSource(sourceCode: string | null | undefined): boolean {
  if (!sourceCode) return false;
  return (WELFARE_LISTING_EXCLUDED_SOURCES as readonly string[]).includes(sourceCode);
}

export function isExcludedLoanSource(sourceCode: string | null | undefined): boolean {
  if (!sourceCode) return false;
  return (LOAN_LISTING_EXCLUDED_SOURCES as readonly string[]).includes(sourceCode);
}
