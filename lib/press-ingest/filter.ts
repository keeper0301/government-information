// ============================================================
// 광역 보도자료 → welfare/loan 등록 후보 L1 필터 (LLM 미사용)
// ============================================================
// news_posts 24h × 광역 ministry × 신청 가능 신호 키워드 매칭.
// 사장님이 후보 페이지에서 직접 정책 판단 → 수동 등록 (A 폼).
//
// LLM 분류 (L2) 는 운영 패턴 본 후 별도 진행 (spec 참조).
// L1 만으로도 사장님이 매일 1회 후보 페이지 보면서 광역 자체 사업 발굴 가능.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

// 광역도 ministry 17개 — REGION_TAGS 의 풀네임 (정확 매칭용)
const REGIONAL_MINISTRIES = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원도",
  "강원특별자치도",
  "충청북도",
  "충청남도",
  "전라북도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
];

// 광역 prefix 패턴 — naver-news 가 ministry='전라남도 순천시' 같은 시군 단위로
// 저장한 row 도 매칭. PostgREST or() 에서 ILIKE 패턴 사용.
const PROVINCE_ILIKE_PATTERNS = REGIONAL_MINISTRIES.map(
  (m) => `ministry.ilike.${m}%`,
).join(",");

// 신청 가능 신호 키워드 — title/summary 에 있으면 정책일 가능성 ↑
// PostgREST or() 에서 ILIKE 패턴으로 사용
const POLICY_SIGNAL_KEYWORDS = [
  "지원금",
  "보조금",
  "바우처",
  "수당",
  "환급",
  "지원사업",
  "모집",
  "신청",
  "접수",
];

export type PressIngestCandidate = {
  id: string;
  title: string;
  summary: string | null;
  ministry: string | null;
  source_outlet: string | null;
  published_at: string;
  slug: string;
};

// 24h 내 광역도 보도자료 중 신청 신호 매칭 row
export async function getPressIngestCandidates(
  hours: number = 24,
  limit: number = 50,
): Promise<PressIngestCandidate[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // ILIKE OR — title 또는 summary 에 신호 키워드 1개라도 매칭
  const titleOrFilter = POLICY_SIGNAL_KEYWORDS.map(
    (k) => `title.ilike.%${k}%`,
  ).join(",");
  const summaryOrFilter = POLICY_SIGNAL_KEYWORDS.map(
    (k) => `summary.ilike.%${k}%`,
  ).join(",");

  const { data, error } = await admin
    .from("news_posts")
    .select("id, title, summary, ministry, source_outlet, published_at, slug")
    .gte("published_at", since)
    // 광역 + 시군 (광역 prefix) 동시 매칭 — '전라남도' 또는 '전라남도 순천시'
    .or(PROVINCE_ILIKE_PATTERNS)
    .or(`${titleOrFilter},${summaryOrFilter}`)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[press-ingest:filter] 후보 조회 실패:", error);
    return [];
  }

  return (data ?? []) as PressIngestCandidate[];
}

// 운영 KPI — Step 3 가시화용
// (24h 후보 / 24h manual_admin 등록 / 24h LLM 호출)
//
// candidates_24h: 24h 동안 광역+키워드 매칭된 raw 후보 수 (KPI 카드 "24h 후보")
// unclassified_24h: 그 중 press_ingest_candidates 에 아직 안 들어간 = L2 분류 대기
//   → dashboard 적체 알림은 이걸 기준으로 (자동화 후에도 raw count 가 줄지 않는
//     문제를 우회. cron 이 분류한 row 는 unclassified 에서 빠짐)
export type PressIngestKpi = {
  candidates_24h: number;
  unclassified_24h: number;
  manual_registered_24h: number;
  llm_classify_24h: number;
  l2_pending: number;
};

export async function getPressIngestKpi(): Promise<PressIngestKpi> {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    candidatesRes,
    registeredRes,
    manualClassifyRes,
    l2ClassifyRes,
    pendingRes,
  ] = await Promise.all([
    // 24h 후보 ids fetch — candidates_24h count + unclassified_24h 차집합 양쪽 사용
    // limit 500 안전 cap (24h 광역 발행이 그 이상 되면 정상 X, 추가 fetch 도 차단)
    (() => {
      const titleOrFilter = POLICY_SIGNAL_KEYWORDS.map(
        (k) => `title.ilike.%${k}%`,
      ).join(",");
      const summaryOrFilter = POLICY_SIGNAL_KEYWORDS.map(
        (k) => `summary.ilike.%${k}%`,
      ).join(",");
      return admin
        .from("news_posts")
        .select("id")
        .gte("published_at", since24h)
        .or(PROVINCE_ILIKE_PATTERNS)
        .or(`${titleOrFilter},${summaryOrFilter}`)
        .limit(500);
    })(),
    // 24h 사장님 수동 등록 — admin_actions.manual_program_create 중
    // details.kind != 'press_classify' (LLM 호출만 한 경우 제외)
    admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "manual_program_create")
      .gte("created_at", since24h)
      .not("details->>kind", "eq", "press_classify"),
    // 24h 수동 AI 분류
    admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "manual_program_create")
      .gte("created_at", since24h)
      .eq("details->>kind", "press_classify"),
    // 24h cron L2 분류
    admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "press_l2_classify")
      .gte("created_at", since24h),
    // 현재 confirm 대기 L2 후보
    admin
      .from("press_ingest_candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  // 24h 후보 ids 추출 (candidatesRes.data 는 [{id}, ...])
  const candidateIds = (
    (candidatesRes.data ?? []) as { id: string }[]
  ).map((p) => p.id);
  const candidates_24h = candidateIds.length;

  // unclassified_24h — press_ingest_candidates 에 안 들어간 ids 만 카운트
  // candidateIds 가 비면 IN 조회 skip (PostgREST 빈 IN 거부 회피)
  let unclassified_24h = candidates_24h;
  if (candidateIds.length > 0) {
    const { data: classified, error: classifiedErr } = await admin
      .from("press_ingest_candidates")
      .select("news_id")
      .in("news_id", candidateIds);
    if (classifiedErr) {
      // graceful degrade — fallback 은 raw count (자동화 전 동작과 동일)
      console.warn(
        "[press-ingest:kpi] press_ingest_candidates IN 조회 실패:",
        classifiedErr.message,
      );
    } else {
      const classifiedSet = new Set(
        (classified ?? []).map((c) => c.news_id as string),
      );
      unclassified_24h = candidateIds.filter(
        (id) => !classifiedSet.has(id),
      ).length;
    }
  }

  return {
    candidates_24h,
    unclassified_24h,
    manual_registered_24h: registeredRes.count ?? 0,
    llm_classify_24h: (manualClassifyRes.count ?? 0) + (l2ClassifyRes.count ?? 0),
    l2_pending: pendingRes.count ?? 0,
  };
}

// ─── 7일 자동 등록 추세 (일별 카운트) ───
// "오늘 자동 등록 작동했나?" 한눈에 + 추세 시각화.

export type AutoIngestDay = {
  day: string; // 'YYYY-MM-DD' (KST 기준)
  count: number;
};

export async function getAutoIngestTrend(days: number = 7): Promise<AutoIngestDay[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("admin_actions")
    .select("created_at")
    .eq("action", "press_l2_confirm")
    .gte("created_at", since);

  if (error || !data) {
    console.warn("[press-ingest:trend] 조회 실패:", error?.message);
    return [];
  }

  // 최근 N일을 KST 기준으로 day key 생성 → 카운트 0 인 날도 표시.
  const byDay = new Map<string, number>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    byDay.set(key, 0);
  }
  for (const row of data) {
    const key = new Date(row.created_at).toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    if (byDay.has(key)) {
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
  }
  return Array.from(byDay, ([day, count]) => ({ day, count }));
}

// ─── 자동 confirm 운영 통계 (Layer 의존도) ───
// /admin/press-ingest 페이지 KPI 카드 + daily-digest SMS 에 노출.

import { PROVINCE_DEFAULT_URLS } from "./province-default-urls";

export type PressAutoConfirmStats = {
  /** 24시간 자동 등록 건수 (admin_actions actor_id IS NULL) */
  auto_confirmed_24h: number;
  /** 7일 자동 등록 건수 */
  auto_confirmed_7d: number;
  /** 광역 매핑 fallback 의존도 (%) — 7일 confirmed 후보의 apply_url 중 PROVINCE_DEFAULT_URLS 일치 비율.
   *  높으면 LLM 추출률이 낮다는 신호 → prompt 재검토 또는 광역 sub-path 정밀화 필요. */
  province_dependency_pct: number;
};

export async function getPressAutoConfirmStats(): Promise<PressAutoConfirmStats> {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [conf24, conf7d, recent7d] = await Promise.all([
    admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "press_l2_confirm")
      .is("actor_id", null)
      .gte("created_at", since24h),
    admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "press_l2_confirm")
      .is("actor_id", null)
      .gte("created_at", since7d),
    admin
      .from("press_ingest_candidates")
      .select("classified_payload")
      .eq("status", "confirmed")
      .is("confirmed_by", null)
      .gte("confirmed_at", since7d),
  ]);

  // 광역 매핑 의존도 — apply_url 이 PROVINCE_DEFAULT_URLS 의 value 와 정확히 일치하는 비율
  const provinceUrls = new Set(Object.values(PROVINCE_DEFAULT_URLS));
  const recent = (recent7d.data ?? []) as Array<{
    classified_payload: { apply_url?: string | null } | null;
  }>;
  const total = recent.length;
  let provinceCount = 0;
  for (const r of recent) {
    const url = r.classified_payload?.apply_url;
    if (url && provinceUrls.has(url)) provinceCount += 1;
  }
  const province_dependency_pct =
    total === 0 ? 0 : Math.round((provinceCount / total) * 100);

  return {
    auto_confirmed_24h: conf24.count ?? 0,
    auto_confirmed_7d: conf7d.count ?? 0,
    province_dependency_pct,
  };
}

// ─── 최근 L2 승인 등록된 정책 N건 (welfare + loan 통합) ───
// 사장님이 "정말 자동으로 들어왔는지" 한눈에 확인. 사이트 detail 직링.

export type RecentAutoRow = {
  id: string;
  table: "welfare" | "loan";
  title: string;
  region: string | null;
  category: string | null;
  createdAt: string;
};

export async function getRecentAutoIngestRows(limit: number = 5): Promise<RecentAutoRow[]> {
  const admin = createAdminClient();

  // welfare + loan 양쪽 fetch 후 시간순 merge — 양 테이블이 작아 N+1 비용 무시 가능.
  const [welfareRes, loanRes] = await Promise.all([
    admin
      .from("welfare_programs")
      .select("id, title, region, category, created_at")
      .eq("source_code", "press_l2_confirm")
      .order("created_at", { ascending: false })
      .limit(limit),
    admin
      .from("loan_programs")
      .select("id, title, category, created_at")
      .eq("source_code", "press_l2_confirm")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const merged: RecentAutoRow[] = [];
  for (const r of welfareRes.data ?? []) {
    merged.push({
      id: r.id,
      table: "welfare",
      title: r.title,
      region: r.region,
      category: r.category,
      createdAt: r.created_at,
    });
  }
  for (const r of loanRes.data ?? []) {
    merged.push({
      id: r.id,
      table: "loan",
      title: r.title,
      region: null,
      category: r.category,
      createdAt: r.created_at,
    });
  }

  return merged
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
    .slice(0, limit);
}
