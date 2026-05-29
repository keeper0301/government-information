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

// 2026-05-29 — 노원구. 정적 BD_select collector 가 본문(무클래스 span 조각)을 못 잡아
// 누적 0건이었으나, Playwright 렌더 후 표준 BODY_SELECTOR 로 본문 추출 검증(1637자).
export const scrapeNowon = makeScraper({
  cityName: "노원구",
  listUrl: "https://www.nowon.kr/www/user/bbs/BD_selectBbsList.do?q_bbsCode=1027",
});

// 2026-05-29 — 동래구(부산) 구정소식(BBS_0000012). 기존 정적 collector 의 BBS_0000001 은
// 사전정보공개 게시판이라 0건이었음 → 실제 소식 게시판으로 교정.
// 부산 SI CMS 본문은 class 없는 td (colspan=6 + style padding). #view 는 제목·메타까지
// 잡아 잡음 → 본문 셀만 지정. (주의: 부산 자치구라도 스킨별 본문 컨테이너가 달라 구마다 확인 필요.)
const BUSAN_SI_BODY = ["#view td[colspan='6'][style*='padding']", "td[colspan='6'][style*='padding']"];
export const scrapeDongnae = makeScraper({
  cityName: "동래구",
  listUrl: "https://www.dongnae.go.kr/board/list.dongnae?boardId=BBS_0000012&menuCd=DOM_000000103001001000&startPage=1",
  bodySelectors: BUSAN_SI_BODY,
});

// 2026-05-29 — 부산진구. BBS_0000265 보도자료(현재 등록 URL 정상). 본문 div.substan.
export const scrapeBusanjin = makeScraper({
  cityName: "부산진구",
  listUrl: "https://www.busanjin.go.kr/board/list.busanjin?boardId=BBS_0000265&menuCd=DOM_000000103007004000",
  bodySelectors: [".substan"],
});

// 2026-05-29 — 금정구. BBS_0000004 소식(현재 등록 URL 정상). 본문 td.contents (colspan).
export const scrapeGeumjeong = makeScraper({
  cityName: "금정구",
  listUrl: "https://www.geumjeong.go.kr/board/list.geumj?boardId=BBS_0000004",
  bodySelectors: ["td.contents", ".contents"],
});

// 2026-05-29 — 부산 북구. 구정소식 BBS_0000012(정적은 BBS_0000001 사전정보공개 오등록).
// 본문 JS 렌더 → chromium 필요. 컨테이너 div.board_con.
export const scrapeBsbukgu = makeScraper({
  cityName: "부산 북구",
  listUrl: "https://www.bsbukgu.go.kr/board/list.bsbukgu?boardId=BBS_0000012&menuCd=DOM_000000103001001000",
  bodySelectors: [".board_con", ".board-view-wrap"],
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
    nowon: scrapeNowon,
    dongnae: scrapeDongnae,
    busanjin: scrapeBusanjin,
    geumjeong: scrapeGeumjeong,
    bsbukgu: scrapeBsbukgu,
  };
  const fn = map[target];
  if (!fn) {
    console.error(`unknown city: ${target}. 사용: changwon|seongnam|ansan|cheonan|busan|suyeong|haeundae|nowon|dongnae|busanjin|geumjeong|bsbukgu`);
    process.exit(1);
  }
  const items = await fn({ limit: 3, headless: true });
  console.log(`[${target}] fetched ${items.length} items`);
  for (const it of items) {
    console.log(`  ${it.publishedDate ?? "-"} | ${it.title.slice(0, 60)}`);
    console.log(`    body ${it.body.length}자: ${it.body.slice(0, 80)}...`);
  }
}
