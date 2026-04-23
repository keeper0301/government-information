// ============================================================
// 컬렉터 공통 인프라
// ============================================================
// 모든 정책 수집 컬렉터는 Collector 인터페이스를 구현한다.
// runCollectors() 가 레지스트리를 순회하며 실행·로깅·upsert 를 담당.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

// 수집한 정책 1건 — 컬렉터가 리턴하는 표준 포맷
export type CollectedItem = {
  // 식별
  sourceCode: string;        // 'gov24'|'bizinfo'|'bokjiro'|'sbiz24'|'nhis' 등 (source_fetch_log 키)
  sourceId: string;          // 원본 ID — 같은 소스 내에서 unique (예: 보조금24 servId)

  // 분류 테이블 (welfare vs loan)
  // 'welfare' — 복지·수혜성 정책 (welfare_programs)
  // 'loan' — 대출·금융상품 (loan_programs)
  table: "welfare" | "loan";

  // 본문
  title: string;
  category?: string;         // 기존 category 컬럼 (NOT NULL 이므로 기본값 필요)
  target?: string | null;
  description?: string | null;
  eligibility?: string | null;
  benefits?: string | null;
  applyMethod?: string | null;
  applyUrl?: string | null;
  applyStart?: string | null; // "YYYY-MM-DD"
  applyEnd?: string | null;

  // 소스 정보
  source: string;             // 소관기관명 (화면 표시용)
  sourceUrl?: string | null;
  region?: string | null;     // 광역시도 (기존 region 컬럼 호환용)
  publishedAt?: string | null; // 원본 등록일 — 최신성 정렬의 핵심

  // 대출 전용 (table='loan' 일 때만)
  loanAmount?: string | null;
  interestRate?: string | null;
  repaymentPeriod?: string | null;

  // 표준 태그 (택소노미 기준) — 컬렉터가 최대한 채워서 넘기면 enrich 부담 ↓
  regionTags?: string[];
  ageTags?: string[];
  occupationTags?: string[];
  benefitTags?: string[];
  householdTags?: string[];

  // 원본 응답 (JSON 직렬화 가능해야 함)
  rawPayload?: unknown;
};

// 컬렉터 실행 결과
export type CollectorResult = {
  sourceCode: string;
  collected: number;          // 새로 추가·갱신된 건수
  skipped: number;            // 옛 연도 등으로 스킵
  errors: number;
  error?: string;             // 전체 실패 시
  elapsedMs: number;
};

// 컬렉터 인터페이스
export type Collector = {
  sourceCode: string;         // 'gov24', 'bizinfo' 등 (unique key)
  label: string;              // 운영 로그용 한국어 라벨 (예: "보조금24")
  enabled: () => boolean;     // 환경변수 확인 등 — false 면 스킵
  fetch: (opts: {
    lastFetchedAt: Date | null;
  }) => AsyncGenerator<CollectedItem, void, unknown>;
};

// ============================================================
// 공통 실행 루프
// ============================================================

type SupabaseAdmin = SupabaseClient;

// 컬렉터 1개 실행 + DB 저장. 제네레이터에서 아이템을 받아 upsert.
export async function runOneCollector(
  supabase: SupabaseAdmin,
  collector: Collector,
): Promise<CollectorResult> {
  const startedAt = Date.now();
  const result: CollectorResult = {
    sourceCode: collector.sourceCode,
    collected: 0,
    skipped: 0,
    errors: 0,
    elapsedMs: 0,
  };

  if (!collector.enabled()) {
    result.error = "disabled (env var 누락)";
    result.elapsedMs = Date.now() - startedAt;
    return result;
  }

  // 마지막 수집 시각 조회 (증분 수집)
  const { data: logRow } = await supabase
    .from("source_fetch_log")
    .select("last_fetched_at")
    .eq("source_code", collector.sourceCode)
    .maybeSingle();
  const lastFetchedAt = logRow?.last_fetched_at
    ? new Date(logRow.last_fetched_at)
    : null;

  let latestPublishedAt: string | null = null;
  let lastSourceId: string | null = null;

  try {
    for await (const item of collector.fetch({ lastFetchedAt })) {
      try {
        await upsertItem(supabase, item);
        result.collected++;
        if (item.publishedAt) {
          if (!latestPublishedAt || item.publishedAt > latestPublishedAt) {
            latestPublishedAt = item.publishedAt;
          }
        }
        lastSourceId = item.sourceId;
      } catch (err) {
        result.errors++;
        // 개별 실패는 흐름을 멈추지 않음
        console.error(`[collect:${collector.sourceCode}] upsert 실패`, err);
      }
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  // 로그 기록
  await supabase.from("source_fetch_log").upsert(
    {
      source_code: collector.sourceCode,
      last_fetched_at: new Date().toISOString(),
      last_source_id: lastSourceId,
      last_published_at: latestPublishedAt,
      last_collected_count: result.collected,
      last_error: result.error || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source_code" }
  );

  result.elapsedMs = Date.now() - startedAt;
  return result;
}

// ============================================================
// 개별 item DB 저장 (welfare / loan 분기)
// ============================================================
async function upsertItem(supabase: SupabaseAdmin, item: CollectedItem) {
  const table = item.table === "loan" ? "loan_programs" : "welfare_programs";
  const now = new Date().toISOString();

  // 공통 필드
  const base: Record<string, unknown> = {
    title: item.title.substring(0, 200),
    category: item.category || (item.table === "loan" ? "대출" : "소득"),
    target: item.target ?? null,
    description: item.description?.substring(0, 2000) ?? null,
    eligibility: item.eligibility?.substring(0, 2000) ?? null,
    apply_method: item.applyMethod?.substring(0, 1000) ?? null,
    apply_url: item.applyUrl ?? null,
    apply_start: item.applyStart ?? null,
    apply_end: item.applyEnd ?? null,
    source: item.source,
    source_url: item.sourceUrl ?? null,
    source_code: item.sourceCode,
    source_id: item.sourceId,
    published_at: item.publishedAt ?? null,
    fetched_at: now,
    raw_payload: item.rawPayload ?? null,
    region_tags: item.regionTags ?? [],
    age_tags: item.ageTags ?? [],
    occupation_tags: item.occupationTags ?? [],
    benefit_tags: item.benefitTags ?? [],
    household_tags: item.householdTags ?? [],
    updated_at: now,
  };

  if (item.table === "welfare") {
    base.benefits = item.benefits?.substring(0, 1000) ?? null;
    base.region = item.region ?? "전국";
  } else {
    base.loan_amount = item.loanAmount ?? null;
    base.interest_rate = item.interestRate ?? null;
    base.repayment_period = item.repaymentPeriod ?? null;
  }

  // (source_code, source_id) 기반 upsert — 007 마이그레이션의 unique index
  const { error } = await supabase
    .from(table)
    .upsert(base, { onConflict: "source_code,source_id" });

  if (error) {
    // source_id 가 없거나 unique 위반 외 에러 → title 기반 폴백 (기존 호환)
    const { error: fallbackError } = await supabase
      .from(table)
      .upsert(base, { onConflict: "title" });
    if (fallbackError) throw fallbackError;
  }
}

// ============================================================
// 레지스트리 (새 컬렉터는 여기에 등록)
// ============================================================
// 지연 임포트로 순환 의존 회피 + 필요할 때만 로드
export async function getAllCollectors(): Promise<Collector[]> {
  const mods = await Promise.all([
    import("./bokjiro"),
    import("./local-welfare"),
    import("./youth-v2"),
    import("./loans-mss"),
    import("./gov24"),
    import("./bizinfo"),
    import("./kstartup"),
    import("./smes"),
    import("./sbiz24"),
    import("./semas-policy-fund"),
    import("./koreg-haedream"),
    import("./nhis"),
    import("./employment"),
  ]);
  return mods.map((m) => m.default);
}
