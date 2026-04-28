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

// 광역도 ministry 17개 — REGION_TAGS 의 풀네임
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
    .in("ministry", REGIONAL_MINISTRIES)
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
export type PressIngestKpi = {
  candidates_24h: number;
  manual_registered_24h: number;
  llm_classify_24h: number;
  auto_ingested_24h: number;
};

export async function getPressIngestKpi(): Promise<PressIngestKpi> {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [candidatesRes, registeredRes, classifyRes, autoIngestRes] = await Promise.all([
    // 24h 후보 — 같은 필터 로직, count only (head:true)
    (() => {
      const titleOrFilter = POLICY_SIGNAL_KEYWORDS.map(
        (k) => `title.ilike.%${k}%`,
      ).join(",");
      const summaryOrFilter = POLICY_SIGNAL_KEYWORDS.map(
        (k) => `summary.ilike.%${k}%`,
      ).join(",");
      return admin
        .from("news_posts")
        .select("id", { count: "exact", head: true })
        .gte("published_at", since24h)
        .in("ministry", REGIONAL_MINISTRIES)
        .or(`${titleOrFilter},${summaryOrFilter}`);
    })(),
    // 24h 사장님 수동 등록 — admin_actions.manual_program_create 중
    // details.kind != 'press_classify' (LLM 호출만 한 경우 제외)
    admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "manual_program_create")
      .gte("created_at", since24h)
      .not("details->>kind", "eq", "press_classify"),
    // 24h LLM 호출 — admin_actions.manual_program_create 중 details.kind = 'press_classify'
    admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "manual_program_create")
      .gte("created_at", since24h)
      .eq("details->>kind", "press_classify"),
    // 24h 자동 ingest — admin_actions.auto_press_ingest
    admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "auto_press_ingest")
      .gte("created_at", since24h),
  ]);

  return {
    candidates_24h: candidatesRes.count ?? 0,
    manual_registered_24h: registeredRes.count ?? 0,
    llm_classify_24h: classifyRes.count ?? 0,
    auto_ingested_24h: autoIngestRes.count ?? 0,
  };
}
