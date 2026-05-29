// ============================================================
// keepioo 플레이wright 보도자료 실행기
// ============================================================
// 정적 수집기로 처리하기 어려운 SPA (화면에서 자바스크립트로 목록을 그리는 사이트)
// 보도자료를 브라우저로 읽은 뒤, keepioo 서버의 배치 저장 API로 보냅니다.
//
// 실행:
//   node runner.mjs
//
// 필요한 환경변수:
//   KEEPIOO_API_URL    예: https://www.keepioo.com
//   KEEPIOO_API_KEY    /api/admin/import-press-batch 인증 키
// ============================================================

import {
  scrapeChangwon,
  scrapeSeongnam,
  scrapeAnsan,
  scrapeCheonan,
  scrapeBusan,
  scrapeSuyeong,
  scrapeHaeundae,
  scrapeNowon,
  scrapeDongnae,
} from "./lib/cities.mjs";

const ALL_COLLECTORS = [
  { city: "창원시", key: "changwon", fn: scrapeChangwon },
  { city: "성남시", key: "seongnam", fn: scrapeSeongnam },
  { city: "안산시", key: "ansan", fn: scrapeAnsan },
  { city: "천안시", key: "cheonan", fn: scrapeCheonan },
  { city: "부산광역시", key: "busan", fn: scrapeBusan },
  { city: "수영구", key: "suyeong", fn: scrapeSuyeong },
  { city: "해운대구", key: "haeundae", fn: scrapeHaeundae },
  { city: "노원구", key: "nowon", fn: scrapeNowon },
  { city: "동래구", key: "dongnae", fn: scrapeDongnae },
];

// KEEPIOO_RUNNER_CITIES (쉼표 구분) 가 있으면 해당 key 만 실행.
// 프록시 우회로 검증된 도시만 점진 활성화하기 위함 (미검증 도시 0건/잡음 방지).
const ONLY = (process.env.KEEPIOO_RUNNER_CITIES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const COLLECTORS = ONLY.length
  ? ALL_COLLECTORS.filter((c) => ONLY.includes(c.key))
  : ALL_COLLECTORS;

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
    console.error("KEEPIOO_API_URL과 KEEPIOO_API_KEY 환경변수가 필요합니다.");
    process.exit(1);
  }

  for (const { city, key, fn } of COLLECTORS) {
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
  console.error("실행기가 중단되었습니다:", e);
  process.exit(1);
});
