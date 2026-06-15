// "어제 cron 어때?" 점검 — 최근 24시간 수집 현황을 Supabase 에서 조회.
// 실행: node --env-file=.env.local tools/check-cron-result.mjs
// GHA 23+도시 local-press + Vercel naver-news + korea.kr 부처는 news_posts 에,
// 정책은 welfare_programs / loan_programs 에 적재된다.
// (news_posts 의 collector 식별 컬럼은 source_code, source 아님 — 2026-06-15 교정)
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
const since48 = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

// 1) news_posts 최근 24h — source_code 별 집계 + 분류/AI해설 진행률
const { data: news, error: ne } = await sb
  .from("news_posts")
  .select("source_code, classified_at, ai_commentary, created_at")
  .gte("created_at", since24)
  .limit(8000);

if (ne) {
  console.log("❌ news_posts 조회 에러:", ne.message);
} else {
  let classified = 0;
  let commented = 0;
  const bySource = {};
  for (const r of news) {
    bySource[r.source_code] = (bySource[r.source_code] || 0) + 1;
    if (r.classified_at) classified++;
    if (r.ai_commentary) commented++;
  }
  const pct = (n) => (news.length ? Math.round((n / news.length) * 100) : 0);
  console.log(`\n=== 최근 24h news_posts: 총 ${news.length}건 ===`);
  console.log(`  분류완료 ${classified} (${pct(classified)}%) | AI해설 ${commented} (${pct(commented)}%)`);
  console.log(`  collector(source_code) ${Object.keys(bySource).length}종`);
  console.log("\n[source_code 별 — 많은 순]");
  Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .forEach(([s, c]) => console.log(`  ${s}: ${c}`));
}

// 2) 직전 24h(24~48h) 와 비교 — 급감/멈춤 감지용
const { count: prev24 } = await sb
  .from("news_posts")
  .select("*", { count: "exact", head: true })
  .gte("created_at", since48)
  .lt("created_at", since24);
console.log(`\n=== 비교: 직전 24h(어제의 어제) news_posts ${prev24}건 ===`);

// 3) 정책 테이블 최근 24h 신규
console.log("\n=== 정책 신규(최근 24h) ===");
for (const t of ["welfare_programs", "loan_programs"]) {
  const { count, error } = await sb
    .from(t)
    .select("*", { count: "exact", head: true })
    .gte("created_at", since24);
  console.log(`  ${t}: ${error ? "에러 " + error.message : count + "건"}`);
}
