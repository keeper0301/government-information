// ============================================================
// Detail Fetcher 공통 인프라
// ============================================================
// 목록 API 만 호출하던 기존 collector 가 못 채우던 빈 필드 (eligibility,
// selection_criteria, contact_info, detailed_content 등) 를 상세 API 로
// 2차 채움. LLM 안 씀 — 공공 API 응답을 그대로 정제해서 DB 에 저장.
//
// 호출 주기: /api/enrich-detail cron 이 last_detail_fetched_at NULL OR
// 7일 이전 row 를 골라 배치 처리. 실패 시 last_detail_failed_at 찍어
// 1일 쿨다운.
// ============================================================

// Detail API 한 건 조회 결과 — DB 컬럼 그대로 매핑
export type DetailResult = {
  eligibility?: string | null;
  benefits?: string | null;
  selection_criteria?: string | null;
  apply_method?: string | null;
  required_documents?: string | null;
  contact_info?: string | null;
  detailed_content?: string | null;
};

// 개별 row 의 identity — detail fetcher 가 호출에 쓸 최소 정보
export type RowIdentity = {
  id: string;
  source_code: string | null;   // collector 의 sourceCode
  source_id: string | null;     // 원본 ID (bokjiro 의 servId 등)
  source_url: string | null;
  /**
   * 수집 시점의 List API 응답 원본 (JSONB).
   * 일부 fetcher 는 외부 호출 대신 여기서 필드를 추출 — 예: youthcenter
   * (공식 Detail API 미제공이므로 raw_payload 가 유일한 데이터 소스).
   */
  raw_payload?: Record<string, unknown> | null;
};

export type DetailFetcher = {
  sourceCode: string;
  label: string;
  enabled: () => boolean;
  // 이 fetcher 가 처리 가능한 row 인지 — sourceCode 와 필수 필드 검증
  applies: (row: RowIdentity) => boolean;
  // 실제 fetch — 결과 없으면 null (후처리에서 스킵)
  fetchDetail: (row: RowIdentity) => Promise<DetailResult | null>;
};

// bokjiro detail fetcher
import bokjiroDetail from "./bokjiro";
import youthcenterDetail from "./youthcenter";

export const DETAIL_FETCHERS: DetailFetcher[] = [bokjiroDetail, youthcenterDetail];

// row 에 대응하는 fetcher 찾기
export function findFetcher(row: RowIdentity): DetailFetcher | null {
  for (const f of DETAIL_FETCHERS) {
    if (f.enabled() && f.applies(row)) return f;
  }
  return null;
}
