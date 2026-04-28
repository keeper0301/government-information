// ============================================================
// 홈 인기 정책 TOP 5 — 1800px+ fixed sticky sidebar
// ============================================================
// view_count 기반 인기 정책 5건. lib/popular-picks.ts 의 getPopularPicks
// (react cache) 로 데이터 fetch — 일반 섹션 (PopularPicksRow) 과 round
// trip 공유.
// ============================================================

import { getPopularPicks } from "@/lib/popular-picks";
import { PopularPicksAside } from "./popular-picks-aside";

export async function HomePopularPicks({ isLoggedIn }: { isLoggedIn: boolean }) {
  const picks = await getPopularPicks(5);
  if (picks.length === 0) return null;
  return <PopularPicksAside picks={picks} isLoggedIn={isLoggedIn} />;
}
