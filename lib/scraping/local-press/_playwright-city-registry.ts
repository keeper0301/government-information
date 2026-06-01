// ============================================================
// Playwright runner city registry — 단일 출처 (single source of truth)
// ============================================================
// Playwright runner(playwright/runner.mjs) 의 city key → news_posts insert 메타.
// import-press-batch route(insert) 와 autonomous 가동 카드(playwright-proxy-card)
// 가 공용으로 import → sourceCode 가 이 한 곳에만 존재한다.
//   (이전: 카드가 `local-press-${key}` 로 sourceCode 를 추정 → sasang_news 만
//    실제 DB `local-press-sasang-news`(하이픈) 와 어긋나 항상 미가동 오표시 버그.)
//
// ※ 부산: 광역(busan)은 정적 collector (lib/scraping/local-press/busan.ts) 가 담당하고
//   자치구(dongnae·busanjin·geumjeong·bsbukgu·sasang)는 이 playwright 경로로 수집.
//   두 시스템 공존이지만 source_code 가 분리되어 서로 영향 없음.
// ※ 도시 추가 시: 여기 + workflow yml KEEPIOO_RUNNER_CITIES + runner.mjs ALL_COLLECTORS
//   3곳 동기화 (registry-sync.test.ts 가 키 집합 일치 검증). 현재 13 도시.
// ============================================================

export const PLAYWRIGHT_CITY_REGISTRY: Record<
  string,
  { ministry: string; sourceOutlet: string; sourceCode: string }
> = {
  changwon: {
    ministry: "창원특례시청",
    sourceOutlet: "창원특례시청",
    sourceCode: "local-press-changwon",
  },
  seongnam: {
    ministry: "성남시청",
    sourceOutlet: "성남시청",
    sourceCode: "local-press-seongnam",
  },
  ansan: {
    ministry: "안산시청",
    sourceOutlet: "안산시청",
    sourceCode: "local-press-ansan",
  },
  cheonan: {
    ministry: "천안시청",
    sourceOutlet: "천안시청",
    sourceCode: "local-press-cheonan",
  },
  // 2026-05-29 — 노원구: 정적 BD_select 본문 elusive → Playwright PC 러너로 이관.
  nowon: {
    ministry: "노원구청",
    sourceOutlet: "노원구청",
    sourceCode: "local-press-nowon",
  },
  // 2026-05-29 — 동래구 구정소식(BBS_0000012). 정적은 BBS_0000001(사전정보공개) 오등록이라 0건.
  dongnae: {
    ministry: "동래구청",
    sourceOutlet: "동래구청",
    sourceCode: "local-press-dongnae",
  },
  // 2026-05-29 — 부산 SI CMS 자치구 3종 (부산진·금정·북구). Playwright 프록시 경로 이관.
  busanjin: {
    ministry: "부산진구청",
    sourceOutlet: "부산진구청",
    sourceCode: "local-press-busanjin",
  },
  geumjeong: {
    ministry: "금정구청",
    sourceOutlet: "금정구청",
    sourceCode: "local-press-geumjeong",
  },
  bsbukgu: {
    ministry: "부산 북구청",
    sourceOutlet: "부산 북구청",
    sourceCode: "local-press-bsbukgu",
  },
  // 2026-05-29 — 사상구: 구정소식 게시판 부재. 알림사항(sasang) + 소식지(sasang_news) 2종.
  sasang: {
    ministry: "사상구청",
    sourceOutlet: "사상구청",
    sourceCode: "local-press-sasang",
  },
  sasang_news: {
    ministry: "사상구청",
    sourceOutlet: "사상구청",
    sourceCode: "local-press-sasang-news",
  },
  // 2026-05-29 — 김포시 보도자료(17,781건+). 목록 위젯 혼재·본문 무class td 라 프록시 경로.
  gimpo: {
    ministry: "김포시청",
    sourceOutlet: "김포시청",
    sourceCode: "local-press-gimpo",
  },
  // 2026-05-31 — 영도구. SPA (.web path 가 JS 렌더). Playwright 경로로 수집.
  yeongdo: {
    ministry: "영도구청",
    sourceOutlet: "영도구청",
    sourceCode: "local-press-yeongdo",
  },
};
