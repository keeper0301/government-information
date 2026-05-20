// ============================================================
// keepioo Playwright runner — 1차 시 batch (2026-05-21, #45)
// ============================================================
// SPA 시청 보도자료 scrape 후 keepioo /api/admin/import-press-batch 로 POST.
//
// 실행:
//   node runner.mjs
//
// 환경변수:
//   KEEPIOO_API_URL    keepioo 베이스 URL (예 https://www.keepioo.com)
//   KEEPIOO_API_KEY    /api/admin/import-press-batch 인증 키
//
// 호환:
//   - GitHub Actions ubuntu (워크플로 secrets 로 env 주입)
//   - 사장님 PC (.env.local 또는 task scheduler)
// ============================================================

import { scrapeChangwon } from "./lib/changwon.mjs";

const COLLECTORS = [
  { city: "창원시", key: "changwon", fn: scrapeChangwon },
  // 다음 세션 추가: 성남시 / 안산시 / 천안시
];

async function postBatch({ apiUrl, apiKey, city, items }) {
  const res = await fetch(`${apiUrl}/api/admin/import-press-batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ city, items }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  const apiUrl = process.env.KEEPIOO_API_URL;
  const apiKey = process.env.KEEPIOO_API_KEY;
  if (!apiUrl || !apiKey) {
    console.error("❌ KEEPIOO_API_URL + KEEPIOO_API_KEY env 필수");
    process.exit(1);
  }

  for (const { city, key, fn } of COLLECTORS) {
    console.log(`▶ ${city} (${key}) 시작`);
    let items = [];
    try {
      items = await fn({ limit: 10 });
    } catch (e) {
      console.error(`❌ ${city} scrape 실패: ${e.message}`);
      continue;
    }
    if (items.length === 0) {
      console.log(`  fetched 0 items — skip`);
      continue;
    }
    console.log(`  fetched ${items.length} items`);
    const r = await postBatch({ apiUrl, apiKey, city: key, items });
    console.log(`  POST status=${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
  }
}

main().catch((e) => {
  console.error("runner crashed:", e);
  process.exit(1);
});
