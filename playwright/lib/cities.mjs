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

// 2026-05-22 — busan 정적 fetch 불가 (SPA list). Playwright 로 가동.
export const scrapeBusan = makeScraper({
  cityName: "부산광역시",
  listUrl: "https://www.busan.go.kr/nbtnewsBU",
});

// 2026-05-27 — 부산 자치구 SPA (정적 fetch 불가):
// 수영구·해운대구 — 정적 curl 시 list 0건 (JS 렌더). Playwright 가동.
export const scrapeSuyeong = makeScraper({
  cityName: "수영구",
  listUrl: "https://www.suyeong.go.kr/board/list.suyeong?menuCd=DOM_000000103001006000",
});

// 2026-05-27 — 해운대 구청 main bot 차단 + SPA. menuCd 는 다른 부산 자치구
// 패턴 (DOM_000000103001005000) 추정. 다음 세션 manual test 후 verify.
export const scrapeHaeundae = makeScraper({
  cityName: "해운대구",
  listUrl: "https://www.haeundae.go.kr/board/list.haeundae?boardId=BBS_0000001&menuCd=DOM_000000103001005000",
});

// manual test — `node lib/cities.mjs changwon` (또는 seongnam/ansan/cheonan)
if (import.meta.url === `file://${process.argv[1]}`) {
  const target = (process.argv[2] || "changwon").toLowerCase();
  const map = {
    changwon: scrapeChangwon,
    seongnam: scrapeSeongnam,
    ansan: scrapeAnsan,
    cheonan: scrapeCheonan,
    busan: scrapeBusan,
    suyeong: scrapeSuyeong,
    haeundae: scrapeHaeundae,
  };
  const fn = map[target];
  if (!fn) {
    console.error(`unknown city: ${target}. 사용: changwon|seongnam|ansan|cheonan|busan|suyeong|haeundae`);
    process.exit(1);
  }
  const items = await fn({ limit: 3, headless: true });
  console.log(`[${target}] fetched ${items.length} items`);
  for (const it of items) {
    console.log(`  ${it.publishedDate ?? "-"} | ${it.title.slice(0, 60)}`);
    console.log(`    body ${it.body.length}자: ${it.body.slice(0, 80)}...`);
  }
}
