// ============================================================
// keepioo PC 러너 (가정용 IP 전용 보도자료 수집기)
// ============================================================
// GHA+icn1 프록시(Vercel 데이터센터 IP)가 못 닿는 자치구(중랑·강북 등 portal/bbs +
// 포트 18000류)를 사장님 PC(가정용 한국 IP)에서 직접(프록시 없이) 수집해 keepioo 서버
// /api/admin/import-press-batch 로 전송한다.
//   - GHA runner.mjs 와 달리 KEEPIOO_USE_PROXY 를 쓰지 않는다(직접 fetch = 가정용 IP).
//   - GHA workflow/registry-sync 와 분리(_playwright-city-registry PC_ONLY_CITIES).
//
// 사장님 실행(PC, 가정용 IP):
//   1) 한 번만: .env.local 에 IMPORT_PRESS_API_KEY 추가(Vercel env 와 동일 값).
//   2) 수집:  node --env-file=.env.local playwright/pc-runner.mjs
//      (KEEPIOO_USE_PROXY 는 절대 설정하지 말 것 — 프록시 쓰면 데이터센터 IP 라 막힘.)
//
// 필요한 환경변수:
//   KEEPIOO_API_URL    예 https://www.keepioo.com  (미설정 시 prod 기본값)
//   IMPORT_PRESS_API_KEY 또는 KEEPIOO_API_KEY      /api/admin/import-press-batch 인증 키
// ============================================================

import { scrapeJungnang, scrapeGangbuk } from "./lib/cities.mjs";

// PC 전용 도시 — _playwright-city-registry.PC_ONLY_CITIES 와 키 동기화.
const PC_COLLECTORS = [
  { city: "중랑구", key: "jungnang", fn: scrapeJungnang },
  { city: "강북구", key: "gangbuk", fn: scrapeGangbuk },
];

async function postBatch({ apiUrl, apiKey, city, items }) {
  const res = await fetch(`${apiUrl}/api/admin/import-press-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({ city, items }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  // 프록시 모드면 데이터센터 IP 라 PC 러너 의미가 없음 — 가드.
  if (process.env.KEEPIOO_USE_PROXY) {
    console.error(
      "⚠️ KEEPIOO_USE_PROXY 가 설정돼 있습니다. PC 러너는 직접(가정용 IP) 수집이어야 하므로 해제하세요.",
    );
    process.exit(1);
  }
  const apiUrl = process.env.KEEPIOO_API_URL || "https://www.keepioo.com";
  const apiKey =
    process.env.IMPORT_PRESS_API_KEY || process.env.KEEPIOO_API_KEY;
  if (!apiKey) {
    console.error(
      "IMPORT_PRESS_API_KEY(또는 KEEPIOO_API_KEY) 환경변수가 필요합니다. .env.local 에 추가하세요.",
    );
    process.exit(1);
  }

  for (const { city, key, fn } of PC_COLLECTORS) {
    console.log(`${city} (${key}) 수집 시작`);
    let items = [];
    try {
      items = await fn({ limit: 10 });
    } catch (e) {
      console.error(`${city} 수집 실패: ${e.message}`);
      continue;
    }
    if (items.length === 0) {
      console.log("  가져온 글 0건, 건너뜁니다.");
      continue;
    }
    console.log(`  가져온 글 ${items.length}건`);
    const result = await postBatch({ apiUrl, apiKey, city: key, items });
    console.log(
      `  전송 결과 상태=${result.status} ${JSON.stringify(result.data).slice(0, 120)}`,
    );
  }
}

main().catch((e) => {
  console.error("PC 러너가 중단되었습니다:", e);
  process.exit(1);
});
