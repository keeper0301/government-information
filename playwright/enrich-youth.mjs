// ============================================================
// youth-v1 온통청년 상세 enrichment 배치 (한국 PC Playwright)
// ============================================================
// 레거시 youth-v1(raw_payload·source_id NULL) 1,019건은 기존 youthcenter fetcher
// (raw_payload 기반)가 처리 불가. 상세 페이지(ythPlcyDetail)는 th-td 값이 JS 렌더라
// node fetch 불가 → Playwright 로 렌더 후 th-td 추출(2026-06-11 확인).
// 신규 청년정책은 youth-v2(raw_payload 보유)로 들어와 기존 fetcher 가 처리하므로
// 이 배치는 레거시 고정집합 일회성 백필.
//
// 동작: unique_insight NULL + youth-v1 + ythPlcyDetail URL row → 상세 th-td 추출 →
//   welfare UPDATE. 이후 policy-insight-backfill 이 채워진 본문으로 해설 생성 → 색인.
//
// 실행:
//   node --env-file=.env.local playwright/enrich-youth.mjs
//   ENRICH_LIMIT=2000 ENRICH_DRY_RUN=1 node --env-file=.env.local playwright/enrich-youth.mjs
// ============================================================

import { chromium } from "playwright";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIMIT = parseInt(process.env.ENRICH_LIMIT || "10", 10);
const DRY_RUN = process.env.ENRICH_DRY_RUN === "1";
const DELAY_MS = 1200;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

if (!URL || !KEY) { console.error("env(SUPABASE) 없음"); process.exit(1); }

// 무의미 값(소음) — eligibility 에서 제외.
const SKIP_VALS = new Set(["제한없음", "무관", "해당없음", "해당 없음", "-", "", "0명", "없음", "전공무관"]);

async function pickRows(chunk) {
  const qs = [
    "source_code=eq.youth-v1",
    "unique_insight=is.null",
    "detail_permanently_skipped_at=is.null",
    "last_detail_fetched_at=is.null",
    "last_detail_failed_at=is.null",
    "source_url=like.*ythPlcyDetail*",
    "select=id,title,source_url",
    "order=view_count.desc.nullslast",
    `limit=${Math.min(chunk, 1000)}`,
  ].join("&");
  return fetch(`${URL}/rest/v1/welfare_programs?${qs}`, { headers: H }).then((r) => r.json());
}

async function stamp(id, fields) {
  await fetch(`${URL}/rest/v1/welfare_programs?id=eq.${id}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(fields),
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
  let ok = 0, fail = 0, thin = 0, processed = 0;
  const t0 = Date.now();

  while (processed < LIMIT) {
    const rows = await pickRows(Math.min(1000, LIMIT - processed));
    if (!Array.isArray(rows) || rows.length === 0) { console.log("\n남은 후보 0건 — 완료."); break; }
    console.log(`\n[chunk] ${rows.length}건 (누적 ${processed})`);

    for (const row of rows) {
      processed++;
      try {
        await page.goto(row.source_url, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(1500);
        // th-td 값 추출
        const pairs = await page.evaluate(() => {
          const out = {};
          document.querySelectorAll("th").forEach((th) => {
            const td = th.nextElementSibling;
            const label = (th.textContent || "").trim();
            const val = td ? (td.textContent || "").replace(/\s+/g, " ").trim() : "";
            if (label && val && out[label] === undefined) out[label] = val;
          });
          return out;
        });

        const g = (k) => { const v = (pairs[k] || "").trim(); return v && !SKIP_VALS.has(v) ? v : ""; };
        const benefits = g("지원내용");
        // 자격(지원대상) = 연령·거주지역·소득·학력·전공·취업상태·추가사항·참여제한 합성
        const eligParts = [];
        for (const [lbl, key] of [["연령", "연령"], ["거주지역", "거주지역"], ["소득", "소득"], ["학력", "학력"], ["전공", "전공"], ["취업상태", "취업상태"], ["특화분야", "특화분야"], ["추가사항", "추가사항"], ["참여제한 대상", "참여제한"]]) {
          const v = g(lbl); if (v) eligParts.push(`${key}: ${v}`);
        }
        const eligibility = eligParts.join("\n");
        const apply = [g("신청절차"), g("심사 및 발표"), g("신청 사이트"), g("제출 서류")].filter(Boolean).join("\n");
        const contact = [g("주관 기관"), g("운영 기관"), g("기타 정보")].filter(Boolean).join("\n");
        // 상세 본문 = 의미있는 모든 필드 라벨링 결합
        const detailedParts = [];
        if (benefits) detailedParts.push(`▸ 지원내용\n${benefits}`);
        if (eligibility) detailedParts.push(`▸ 지원대상\n${eligibility}`);
        if (apply) detailedParts.push(`▸ 신청\n${apply}`);
        const period = g("사업 신청기간"); if (period) detailedParts.push(`▸ 신청기간\n${period}`);
        const detailed = detailedParts.join("\n\n");

        if (detailed.length < 80) {
          thin++;
          if (!DRY_RUN) await stamp(row.id, { last_detail_fetched_at: new Date().toISOString(), detail_failed_count: 1 });
        } else if (DRY_RUN) {
          console.log(`  ✅ ${detailed.length}자 — ${row.title.slice(0, 28)}`);
          console.log(`     지원내용: ${benefits.slice(0, 50)}`);
        } else {
          await stamp(row.id, {
            eligibility: eligibility.slice(0, 3000) || null,
            benefits: benefits.slice(0, 3000) || null,
            apply_method: apply.slice(0, 2000) || null,
            contact_info: contact.slice(0, 2000) || null,
            detailed_content: detailed.slice(0, 6000),
            last_detail_fetched_at: new Date().toISOString(),
            detail_failed_count: 0,
          });
          ok++;
        }
      } catch {
        fail++;
        if (!DRY_RUN) await stamp(row.id, { last_detail_failed_at: new Date().toISOString() });
      }
      if (processed % 100 === 0) {
        const min = ((Date.now() - t0) / 60000).toFixed(1);
        console.log(`  …${processed}건 (성공 ${ok}/thin ${thin}/실패 ${fail}, ${min}분)`);
      }
      await page.waitForTimeout(DELAY_MS);
    }
    if (DRY_RUN) break;
  }

  await browser.close();
  const min = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n=== 완료: 성공 ${ok} / thin ${thin} / 실패 ${fail} (총 ${processed}건, ${min}분) ===`);
}

main().catch((e) => { console.error("배치 중단:", e); process.exit(1); });
