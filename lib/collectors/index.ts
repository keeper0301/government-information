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

  // ─────────────────────────────────────────────────────────────
  // 배치 업서트
  // ─────────────────────────────────────────────────────────────
  // 이전엔 yield 마다 await upsertItem (RPC 1회). 신규 3개 source
  // (local-welfare/fsc/kinfa) 는 첫 수집 시 100~수천 건 INSERT 가
  // 있어 Vercel Hobby 60초 한도를 넘겼음.
  // 이제 50건씩 한 번에 upsert → RPC 횟수 50배 감소.
  const FLUSH_SIZE = 50;
  const buffer: CollectedItem[] = [];

  async function flush() {
    if (buffer.length === 0) return;
    try {
      await upsertItems(supabase, buffer);
      result.collected += buffer.length;
    } catch (err) {
      // 배치 실패 시 개별 폴백 (한 건이 unique 위반 등으로 깨졌을 때
      // 나머지가 함께 실패하지 않도록)
      console.error(
        `[collect:${collector.sourceCode}] 배치 ${buffer.length}건 실패, 개별 폴백`,
        err,
      );
      for (const item of buffer) {
        try {
          await upsertItem(supabase, item);
          result.collected++;
        } catch (innerErr) {
          result.errors++;
          console.error(
            `[collect:${collector.sourceCode}] upsert 실패`,
            innerErr,
          );
        }
      }
    } finally {
      buffer.length = 0;
    }
  }

  try {
    for await (const item of collector.fetch({ lastFetchedAt })) {
      buffer.push(item);
      if (item.publishedAt) {
        if (!latestPublishedAt || item.publishedAt > latestPublishedAt) {
          latestPublishedAt = item.publishedAt;
        }
      }
      lastSourceId = item.sourceId;
      if (buffer.length >= FLUSH_SIZE) {
        await flush();
      }
    }
    await flush();
  } catch (err) {
    // fetch 도중 throw 가 나도 지금까지 buffer 에 모인 건 저장 시도
    await flush();
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
// 개별 item → DB row 변환
// ============================================================
function toRow(item: CollectedItem): Record<string, unknown> {
  const now = new Date().toISOString();
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

  return base;
}

// ============================================================
// 단건 upsert (배치 폴백 시에만 사용)
// ============================================================
async function upsertItem(supabase: SupabaseAdmin, item: CollectedItem) {
  const table = item.table === "loan" ? "loan_programs" : "welfare_programs";
  const row = toRow(item);

  const { error } = await supabase
    .from(table)
    .upsert(row, { onConflict: "source_code,source_id" });

  if (error) {
    // source_id 가 없거나 unique 위반 외 에러 → title 기반 폴백 (기존 호환)
    const { error: fallbackError } = await supabase
      .from(table)
      .upsert(row, { onConflict: "title" });
    if (fallbackError) throw fallbackError;
  }
}

// ============================================================
// 배치 upsert — 같은 테이블끼리 묶어서 1회 RPC 로 전송
// ============================================================
async function upsertItems(supabase: SupabaseAdmin, items: CollectedItem[]) {
  if (items.length === 0) return;

  // welfare / loan 분리
  const welfareRows: Record<string, unknown>[] = [];
  const loanRows: Record<string, unknown>[] = [];
  for (const item of items) {
    const row = toRow(item);
    if (item.table === "loan") loanRows.push(row);
    else welfareRows.push(row);
  }

  if (welfareRows.length > 0) {
    const { error } = await supabase
      .from("welfare_programs")
      .upsert(welfareRows, { onConflict: "source_code,source_id" });
    if (error) throw error;
  }

  if (loanRows.length > 0) {
    const { error } = await supabase
      .from("loan_programs")
      .upsert(loanRows, { onConflict: "source_code,source_id" });
    if (error) throw error;
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
    import("./fsc"),
    import("./kinfa"),
  ]);
  return mods.map((m) => m.default);
}
