// ============================================================
// 데이터 신선도 — welfare/loan/news 가장 최근 추가 시각
// ============================================================
// 푸터에 "데이터 마지막 갱신: N분 전" 노출 → 사용자에게 신선함 시그널.
// AdSense 심사·검색 봇에도 "활성 운영 사이트" 시그널.
//
// 3 테이블 모두 created_at desc limit 1 — 인덱스 있어 빠름.
// react cache 로 같은 요청 안 다른 호출자(예: layout footer 1회) 와 공유.
// ============================================================

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type DataFreshness = {
  // 가장 최근 데이터 추가 시각 (ISO string) — 3 테이블 중 최신
  latest_at: string | null;
  // 분 단위 경과 시간 (사용자 표시용). null = 데이터 없음
  minutes_ago: number | null;
};

export const getDataFreshness = cache(async (): Promise<DataFreshness> => {
  const supabase = await createClient();

  const [w, l, n] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("loan_programs")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("news_posts")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const candidates = [
    w.data?.created_at,
    l.data?.created_at,
    n.data?.created_at,
  ].filter((c): c is string => !!c);

  if (candidates.length === 0) {
    return { latest_at: null, minutes_ago: null };
  }

  const latest = candidates.sort().at(-1)!;
  const minutes = Math.floor((Date.now() - new Date(latest).getTime()) / 60_000);
  return { latest_at: latest, minutes_ago: Math.max(minutes, 0) };
});

// 사람이 읽기 쉬운 형식 — "방금 전", "N분 전", "N시간 전", "어제" 등
export function formatFreshness(minutes: number | null): string {
  if (minutes === null) return "데이터 준비 중";
  if (minutes < 1) return "방금 전 갱신";
  if (minutes < 60) return `${minutes}분 전 갱신`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전 갱신`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "어제 갱신";
  return `${days}일 전 갱신`;
}
