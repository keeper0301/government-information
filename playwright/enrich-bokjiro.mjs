// ============================================================
// bokjiro 지자체 복지 상세 enrichment 배치 (한국 PC Playwright)
// ============================================================
// 지자체 복지(source_code=local-welfare)는 data.go.kr 중앙 API 에 한 줄 요약만 있고,
// 전문은 bokjiro 웹 상세(moveTWAT52011M.do) 에만 있다(2026-06-11 확인 — 렌더 631자).
// node fetch 는 TLS 로 실패 → 실제 브라우저(Playwright) + 한국 IP(사장님 PC) 필요.
//
// 동작: unique_insight NULL + local-welfare + bokjiro URL row 를 골라, 상세 페이지를
//   띄워 지원대상/선정기준/서비스내용/신청방법/문의/근거법령 추출 → welfare_programs UPDATE.
//   이후 policy-insight-backfill cron 이 채워진 본문으로 해설 생성 → 색인(noindex 해제).
//
// 실행:
//   node --env-file=.env.local playwright/enrich-bokjiro.mjs            (기본 10건)
//   ENRICH_LIMIT=50 node --env-file=.env.local playwright/enrich-bokjiro.mjs
//   ENRICH_DRY_RUN=1 ... (추출만, DB 미수정 — 품질 검증용)
// ============================================================

import { chromium } from "playwright";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIMIT = parseInt(process.env.ENRICH_LIMIT || "10", 10);
const DRY_RUN = process.env.ENRICH_DRY_RUN === "1";
const DELAY_MS = 1500; // 서버 부담 ↓ polite delay
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

if (!URL || !KEY) {
  console.error("env(SUPABASE) 없음");
  process.exit(1);
}

// 후보 조회 — local-welfare + insight 없음 + bokjiro 상세 URL + 영구 skip 아님 +
// 아직 시도 안 한 것(last_detail_fetched_at·last_detail_failed_at 모두 NULL).
// 모든 결과(성공/thin/실패)에 stamp 를 찍으므로 같은 row 가 재선택되지 않아 종료 보장.
async function pickRows(chunk) {
  const qs = [
    "source_code=eq.local-welfare",
    "unique_insight=is.null",
    "detail_permanently_skipped_at=is.null",
    "last_detail_fetched_at=is.null",
    "last_detail_failed_at=is.null",
    "source_url=like.*moveTWAT52011M*",
    "select=id,title,source_url",
    "order=view_count.desc.nullslast",
    `limit=${Math.min(chunk, 1000)}`, // PostgREST 한 번에 max 1000
  ].join("&");
  const res = await fetch(`${URL}/rest/v1/welfare_programs?${qs}`, { headers: H });
  return res.json();
}

// row 에 stamp PATCH (재선택 방지 + 결과 기록)
async function stamp(id, fields) {
  await fetch(`${URL}/rest/v1/welfare_programs?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify(fields),
  });
}

// 렌더된 본문에서 라벨 구간별 필드 추출. 라벨은 '지원대상→근거법령' 순서로 1회씩 등장.
function extractFields(fullText) {
  const t = fullText.replace(/\s+/g, " ").trim();
  const start = t.indexOf("지원대상");
  if (start < 0) return null;
  // footer/서식 컷
  let end = t.length;
  for (const mark of ["서식/자료", "최종 수정일", "현재 페이지의 메뉴", "만족도"]) {
    const i = t.indexOf(mark, start);
    if (i > start && i < end) end = i;
  }
  const body = t.slice(start, end).trim();

  // 라벨 경계로 필드 분리 (순서 고정)
  const labels = ["지원대상", "선정기준", "서비스 내용", "신청방법", "전화문의", "근거법령"];
  const pos = labels.map((l) => ({ l, i: body.indexOf(l) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i);
  const fields = {};
  for (let k = 0; k < pos.length; k++) {
    const cur = pos[k];
    const nextI = k + 1 < pos.length ? pos[k + 1].i : body.length;
    fields[cur.l] = body.slice(cur.i + cur.l.length, nextI).trim();
  }
  return { body, fields };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
  let ok = 0, fail = 0, thin = 0, processed = 0;
  const t0 = Date.now();

  // chunk(≤1000)씩 가져와 처리. 모든 결과에 stamp 를 찍어 다음 pickRows 에서 빠지므로
  // 같은 row 재선택 없이 LIMIT 또는 잔량 소진까지 순회.
  while (processed < LIMIT) {
    const rows = await pickRows(Math.min(1000, LIMIT - processed));
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log("\n남은 후보 0건 — 전체 완료.");
      break;
    }
    console.log(`\n[chunk] ${rows.length}건 처리 시작 (누적 ${processed})`);

    for (const row of rows) {
      processed++;
      try {
        await page.goto(row.source_url, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(800);
        const fullText = await page.evaluate(() => {
          const el = document.querySelector("[class*=cont]") || document.body;
          return el.innerText || "";
        });
        const ext = extractFields(fullText);
        if (!ext || ext.body.length < 80) {
          thin++;
          // thin(실제 내용 없음): 재시도 무의미 → fetched stamp 로 큐에서 제외.
          if (!DRY_RUN) await stamp(row.id, { last_detail_fetched_at: new Date().toISOString(), detail_failed_count: 1 });
        } else {
          const f = ext.fields;
          const update = {
            eligibility: f["지원대상"]?.slice(0, 3000) || null,
            selection_criteria: f["선정기준"]?.slice(0, 3000) || null,
            benefits: f["서비스 내용"]?.slice(0, 3000) || null,
            apply_method: f["신청방법"]?.slice(0, 2000) || null,
            contact_info: f["전화문의"]?.slice(0, 2000) || null,
            detailed_content: ext.body.slice(0, 6000),
            last_detail_fetched_at: new Date().toISOString(),
            detail_failed_count: 0,
          };
          if (DRY_RUN) {
            console.log(`  ✅ ${ext.body.length}자 — ${row.title.slice(0, 28)}`);
          } else {
            await stamp(row.id, update);
            ok++;
          }
        }
      } catch {
        fail++;
        // 에러(네트워크 등): failed stamp 로 큐 제외(이번 run). 추후 stamp 초기화로 재시도 가능.
        if (!DRY_RUN) await stamp(row.id, { last_detail_failed_at: new Date().toISOString() });
      }
      // 진행률 100건마다 출력
      if (processed % 100 === 0) {
        const min = ((Date.now() - t0) / 60000).toFixed(1);
        console.log(`  …진행 ${processed}건 (성공 ${ok}/thin ${thin}/실패 ${fail}, ${min}분)`);
      }
      await page.waitForTimeout(DELAY_MS);
    }
    if (DRY_RUN) break; // DRY_RUN 은 한 chunk 만
  }

  await browser.close();
  const min = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n=== 완료: 성공 ${ok} / thin ${thin} / 실패 ${fail} (총 ${processed}건, ${min}분) ===`);
}

main().catch((e) => {
  console.error("배치 중단:", e);
  process.exit(1);
});
