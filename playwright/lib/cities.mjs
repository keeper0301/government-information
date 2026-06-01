// ============================================================
// 큰 시 4개 Playwright collector — config + factory 활용
// ============================================================
// 4 city 1차: 창원·성남·안산·천안 (인구 64만~102만)
// 각 city listUrl 만 정의 + makeScraper 가 표준 selector 분기
//
// 다음 batch 추가 시 (안양·부천·부평·진주 등) 여기 한 줄만 추가.
// ============================================================

import { makeScraper } from "./_factory.mjs";

// 2026-05-30 — 창원특례시. 목록 li.li1, 상세는 ?gcode=..&idx=N&amode=view query href
// (onclick 아님 → makeScraper 가 그대로 추적). 본문 div.substance.
// 2026-05-30 — li 안에 .title/.subject/.tit 없어 factory 가 a textContent 잡아 제목 +
// 본문 일부(span.t2)·날짜·부서·조회수까지 한 덩어리(228~253자) 로 들어가던 버그.
// 정확 selector strong.t1 명시(span.t1 "새 글" 배지와 구분).
export const scrapeChangwon = makeScraper({
  cityName: "창원시",
  listUrl: "https://www.changwon.go.kr/cwportal/10310/10429/10432.web",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  listSelectors: ["li.li1"],
  bodySelectors: [".substance"],
  titleSelectors: ["strong.t1"],
});

// 2026-05-29 — 성남시. 목록 상세가 onclick="dataView('N')"(href=#N) → bbsView.do?idx=N GET.
// onclickIdRe 로 id 추출 + detailPath 로 URL 구성. 본문 td.content (boardWrap 은 메타 포함).
export const scrapeSeongnam = makeScraper({
  cityName: "성남시",
  listUrl: "https://www.seongnam.go.kr/city/1000060/30005/bbsList.do",
  onclickIdRe: "dataView\\('(\\d+)'\\)",
  detailPath: "bbsView.do?idx={id}",
  bodySelectors: ["td.content"],
});

// 2026-05-29 — 안산시. 기존 selectBbsList.do(404) → 진짜 언론보도자료 selectPageListBbs.do.
// 상세 a href="#" onclick="fnGoDetail( N )" → selectBbsDetail.do?bbs_seq=N GET.
// 봇 UA 차단 가능성 → Chrome UA.
export const scrapeAnsan = makeScraper({
  cityName: "안산시",
  listUrl: "https://www.ansan.go.kr/www/common/bbs/selectPageListBbs.do?bbs_code=B0238",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  // 범용 selector 가 메뉴 ul 을 먼저 잡아 → 게시물 table 명시.
  listSelectors: ["table tbody tr"],
  onclickIdRe: "fnGoDetail\\(\\s*(\\d+)\\s*\\)",
  detailPath: "selectBbsDetail.do?bbs_code=B0238&bbs_seq={id}",
  // 제목·등록일·내용 행이 모두 tr.p-table__subject 라 첫 매치는 제목(짧음). 본문(th=내용)이
  // 항상 가장 길어 bodyPickLongest 로 채택 → 사진 유무 무관(이전 td:has(.p-photo)는 사진글만 잡음).
  bodySelectors: [".p-table__subject td"],
  bodyPickLongest: true,
});

// 2026-05-29 — 천안시. 기존 _060 은 기금운용 오등록 → 진짜 보도자료 _030 으로 교정.
// 카드형(.item--bodo) + button onclick="fn_search_detail('영숫자nttId')" → view.do?nttId=N GET.
// 제목은 img alt(썸네일 카드). 본문 .board-view__contents (script/갤러리 잡음은 factory 가 정제).
export const scrapeCheonan = makeScraper({
  cityName: "천안시",
  listUrl: "https://www.cheonan.go.kr/bbs/BBSMSTR_000000000030/list.do",
  // 천안은 keepioo-bot UA 를 차단(빈 목록) → 진짜 Chrome UA 필요.
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  listSelectors: [".item--bodo"],
  onclickIdRe: "fn_search_detail\\('([^']+)'\\)",
  detailPath: "view.do?nttId={id}",
  bodySelectors: [".board-view__contents"],
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

// 2026-06-01 — 부산 북구는 eminwon(보도자료 OfrAction.do POST)으로 재이관.
// 기존 proxy(BBS_0000012=공동주택 관리 오등록, 0건) 폐기 → lib/scraping/local-press/bsbukgu-eminwon.ts.

// 2026-05-29 — 사상구 알림사항(BBS_0000001 표준 table). 구정소식 게시판이 없어
// 알림사항(모집·안내·공고)으로 수집. 본문 div.contents.
// 2026-05-30 — fallback `.bbs_vtype` 제거: 본문 0 글(첨부파일만)에서 메타+제목+파일 라벨까지
// 묶어 잡아 dead-junk push (108자 사례 확인). `.contents` 단독으로 본문 있는 글만 채택.
export const scrapeSasang = makeScraper({
  cityName: "사상구",
  listUrl: "https://www.sasang.go.kr/board/list.sasang?boardId=BBS_0000001&menuCd=DOM_000000104008001000&startPage=1",
  bodySelectors: [".contents"],
});

// 2026-05-29 — 사상소식지(구보, BBS_0000100 종합). 갤러리형(div.bbs_gallery5 > dl > dt > a)
// 이라 listSelectors 지정. 본문 div.news_con. 월간 구보라 건수 적음.
export const scrapeSasangNews = makeScraper({
  cityName: "사상구 소식지",
  listUrl: "https://www.sasang.go.kr/news/board/list.sasang?boardId=BBS_0000100&categoryCode1=359&menuCd=DOM_000000901000000000",
  listSelectors: [".bbs_gallery5 dl", ".bbs_gallery5 li"],
  bodySelectors: [".news_con", ".txtBox"],
});

// 2026-05-29 — 김포시(보도자료 17,781건+, 가치 최고). 목록에 위젯(fact/most) 혼재라
// 실제 목록 .p-media-list li 명시. 본문은 무class td(.news_bbs_left td) — view_cont류 없음.
// 2026-05-30 — li 안에 .title/.subject/.tit 없어 factory 가 a textContent 잡아 제목이
// 본문 요약+날짜까지 포함(762자) 되던 버그 → 정확한 selector .p-media__heading-title 명시.
export const scrapeGimpo = makeScraper({
  cityName: "김포시",
  listUrl: "https://www.gimpo.go.kr/news/selectBbsNttList.do?bbsNo=466&key=9377",
  listSelectors: [".p-media-list li"],
  bodySelectors: [".news_bbs_left td", ".news_bbs_left"],
  titleSelectors: [".p-media__heading-title"],
});

// 2026-06-01 — 영도구. list URL `00000/00007/00011.web` 가 JS 렌더 SPA 라
// 기본 LIST_SELECTORS(table/ul.bbs_list 등) 가 매치 0 이었음. Playwright 정찰로
// 진짜 목록 구조 확정: 카드형 ul.even-grid 안 li.column(m1~m12) + a.a1 상세링크
// (?gcode=1027&idx=N&amode=view query href) + 제목 strong.t1 + 날짜 span.t2.
// → 창원시와 동일 CMS(strong.t1 제목 + gcode/idx/amode 링크 + 본문 .substance).
// 본문 .substance 라이브 검증 631자 정상.
export const scrapeYeongdo = makeScraper({
  cityName: "영도구",
  listUrl: "https://www.yeongdo.go.kr/00000/00007/00011.web",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  listSelectors: ["ul.even-grid li.column"],
  bodySelectors: [".substance"],
  titleSelectors: ["strong.t1"],
});

// manual test — `node lib/cities.mjs changwon` (또는 seongnam/ansan/cheonan)
if (import.meta.url === `file://${process.argv[1]}`) {
  const target = (process.argv[2] || "changwon").toLowerCase();
  const map = {
    changwon: scrapeChangwon,
    seongnam: scrapeSeongnam,
    ansan: scrapeAnsan,
    cheonan: scrapeCheonan,
    nowon: scrapeNowon,
    dongnae: scrapeDongnae,
    busanjin: scrapeBusanjin,
    geumjeong: scrapeGeumjeong,
    sasang: scrapeSasang,
    sasang_news: scrapeSasangNews,
    gimpo: scrapeGimpo,
    yeongdo: scrapeYeongdo,
  };
  const fn = map[target];
  if (!fn) {
    console.error(`unknown city: ${target}. 사용: changwon|seongnam|ansan|cheonan|nowon|dongnae|busanjin|geumjeong|sasang|sasang_news|gimpo|yeongdo`);
    process.exit(1);
  }
  const items = await fn({ limit: 3, headless: true });
  console.log(`[${target}] fetched ${items.length} items`);
  for (const it of items) {
    console.log(`  ${it.publishedDate ?? "-"} | ${it.title.slice(0, 60)}`);
    console.log(`    body ${it.body.length}자: ${it.body.slice(0, 80)}...`);
  }
}
