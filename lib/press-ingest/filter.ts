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
