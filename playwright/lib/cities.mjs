// ============================================================
// 큰 시 4개 Playwright collector — config + factory 활용
// ============================================================
// 4 city 1차: 창원·성남·안산·천안 (인구 64만~102만)
// 각 city listUrl 만 정의 + makeScraper 가 표준 selector 분기
//
// 다음 batch 추가 시 (안양·부천·부평·진주 등) 여기 한 줄만 추가.
// ============================================================

import { makeScraper } from "./_factory.mjs";

export const scrapeChangwon = makeScraper({
  cityName: "창원시",
  listUrl: "https://www.changwon.go.kr/cwportal/10310/10429/10432.web",
});

export const scrapeSeongnam = makeScraper({
  cityName: "성남시",
  listUrl: "https://www.seongnam.go.kr/city/1000060/30005/bbsList.do",
});

export const scrapeAnsan = makeScraper({
  cityName: "안산시",
  listUrl: "https://ansan.go.kr/www/common/bbs/selectBbsList.do?bbs_code=B0238",
});

export const scrapeCheonan = makeScraper({
  cityName: "천안시",
  listUrl: "https://www.cheonan.go.kr/prog/bbsArticle/BBSMSTR_000000000060/list.do",
});

// manual test — `node lib/cities.mjs changwon` (또는 seongnam/ansan/cheonan)
if (import.meta.url === `file://${process.argv[1]}`) {
  const target = (process.argv[2] || "changwon").toLowerCase();
  const map = {
    changwon: scrapeChangwon,
    seongnam: scrapeSeongnam,
    ansan: scrapeAnsan,
    cheonan: scrapeCheonan,
  };
  const fn = map[target];
  if (!fn) {
    // eslint-disable-next-line no-console
    console.error(`unknown city: ${target}. 사용: changwon|seongnam|ansan|cheonan`);
    process.exit(1);
  }
  const items = await fn({ limit: 3, headless: true });
  // eslint-disable-next-line no-console
  console.log(`[${target}] fetched ${items.length} items`);
  for (const it of items) {
    // eslint-disable-next-line no-console
    console.log(`  ${it.publishedDate ?? "-"} | ${it.title.slice(0, 60)}`);
    // eslint-disable-next-line no-console
    console.log(`    body ${it.body.length}자: ${it.body.slice(0, 80)}...`);
  }
}
