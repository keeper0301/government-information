// ============================================================
// 네이버 SEO 주간 수집·분석·리포트 오케스트레이션
// ============================================================
// collect → DB 저장(naver_seo_snapshots) → 직전 스냅샷과 비교 → 대응책 리포트 →
// 텔레그램 발송. 세션 만료(LOGIN_REQUIRED) 시 "재로그인 필요" 텔레그램.
//
// 실행: node --env-file=.env.local tools/naver-seo/run.mjs
//   (node 는 .env 자동 로드 안 하므로 --env-file 필수. Supabase·CRON_SECRET 사용.)
// ============================================================

import { collectNaverSeo } from "./collect.mjs";
import { buildReport } from "./analyze.mjs";
import { createClient } from "@supabase/supabase-js";

// 텔레그램은 prod endpoint 로 발송. NEXT_PUBLIC_SITE_URL 이 로컬(localhost:3000)일 수 있어
// prod 고정 + www(비-www 는 307 리다이렉트로 POST 인증 떨어짐).
const TELEGRAM_BASE = "https://www.keepioo.com";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env 누락 (--env-file=.env.local 확인)");
  return createClient(url, key);
}

async function notifyTelegram(text) {
  try {
    const r = await fetch(`${TELEGRAM_BASE}/api/notify-telegram`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// "2026.06.09" → "2026-06-09" (date). 실패 시 null.
function toDate(s) {
  if (!s) return null;
  const m = /(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/.exec(s);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}

async function main() {
  let data;
  try {
    data = await collectNaverSeo({ headless: true });
  } catch (e) {
    if (e.message === "LOGIN_REQUIRED") {
      await notifyTelegram(
        "⚠️ 네이버 SEO 주간 수집 실패 — 세션 만료. PC 에서 `node tools/naver-seo/login.mjs` 로 재로그인 후 다시 수집해 주세요.",
      );
      console.log("세션 만료 — 재로그인 알림 발송 후 종료.");
      process.exit(1);
    }
    throw e;
  }

  const d = data.diagnosis;
  const e = data.expose;

  // 핵심 지표 전부 null = 파싱 실패(네이버 화면 구조 변경 의심). 잘못된 리포트가 나가지
  // 않게 insert 보류 + 알림 (코드리뷰 P1 — silent null 방어).
  if (d.indexed_count == null && e.total_impressions == null) {
    await notifyTelegram(
      "⚠️ 네이버 SEO 수집 — 핵심 지표 파싱 실패(네이버 화면 구조 변경 의심). insert 보류. tools/naver-seo/collect.mjs 점검 필요.",
    );
    console.log("파싱 실패 — 알림 발송 후 종료.");
    process.exit(1);
  }

  const sb = admin();

  // 직전 스냅샷(지난주 비교용) — 저장 전에 조회
  const { data: prev } = await sb
    .from("naver_seo_snapshots")
    .select("*")
    .order("collected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 저장
  const { error: insErr } = await sb.from("naver_seo_snapshots").insert({
    collected_at: data.collected_at,
    indexed_count: d.indexed_count,
    index_excluded: d.index_excluded,
    crawl_limited: d.crawl_limited,
    seo_issues: d.issues,
    diagnosis_updated: toDate(d.updated),
    total_impressions: e.total_impressions,
    total_clicks: e.total_clicks,
    avg_ctr: e.avg_ctr,
    top_keywords: e.top_keywords,
    top_pages: e.top_pages,
    expose_updated: toDate(e.updated),
    raw: data._raw,
  });
  if (insErr) {
    // 저장 실패도 LOGIN_REQUIRED 와 대칭으로 텔레그램 통지 (코드리뷰 P1 — 조용한 실패 방지).
    await notifyTelegram(`⚠️ 네이버 SEO 저장 실패: ${insErr.message.slice(0, 150)}`);
    throw new Error(`저장 실패: ${insErr.message}`);
  }

  // 대응책 리포트 + 텔레그램
  const report = buildReport(data, prev);
  console.log("=== 리포트 ===\n" + report);
  const sent = await notifyTelegram(report);
  console.log(sent ? "✅ 수집·저장·텔레그램 완료" : "⚠️ 저장 완료, 텔레그램 발송 실패");
}

main().catch((e) => {
  console.error("수집 실패:", e);
  process.exit(1);
});
