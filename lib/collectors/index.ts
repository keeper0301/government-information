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
// 외부 API fetch helper — AbortController + timeout
// ============================================================
// data.go.kr 등 외부 API 가 응답 안 줄 때 함수가 무한히 stuck
// 되는 걸 방지. 기본 20초.
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number = 20000,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

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
  // FLUSH_SIZE=200 — debug streaming (a686ed2) 측정 결과 50 으로는
  // RPC 91회로 60초 초과. 200 으로 RPC ~8회 → 60초 안에 충분.
  const FLUSH_SIZE = 200;
  const buffer: CollectedItem[] = [];

  async function flush() {
    if (buffer.length === 0) return;
    try {
      await upsertItems(supabase, buffer);
      result.collected += buffer.length;
    } catch (err) {
      // 일시 네트워크 에러 등 대응 — 개별 재시도 (010·011 마이그레이션 후엔
      // constraint 매칭 실패 가능성 없음)
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
// 010 마이그레이션 후 (source_code, source_id) UNIQUE CONSTRAINT 가
// 정식으로 존재하므로 onConflict 매칭 보장. 011 이후 title 단독
// unique 는 사라졌으므로 title 폴백은 오히려 에러 원인이라 제거.
async function upsertItem(supabase: SupabaseAdmin, item: CollectedItem) {
  const table = item.table === "loan" ? "loan_programs" : "welfare_programs";
  const row = toRow(item);

  const { error } = await supabase
    .from(table)
    .upsert(row, { onConflict: "source_code,source_id" });

  if (error) throw error;
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
