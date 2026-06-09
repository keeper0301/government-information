// ============================================================
// 큰 시 4개 Playwright collector — config + factory 활용
// ============================================================
// 4 city 1차: 창원·성남·안산·천안 (인구 64만~102만)
// 각 city listUrl 만 정의 + makeScraper 가 표준 selector 분기
//
// 다음 batch 추가 시 (안양·부천·부평·진주 등) 여기 한 줄만 추가.
// ============================================================

import {
  makeScraper,
  USE_PROXY,
  PROXY_URL,
  PROXY_KEY,
  USER_AGENT,
} from "./_factory.mjs";
import { fetchSiAttachBody } from "./_si_attach.mjs";

// SI 첨부(hwp/pdf) 본문용 바이너리 fetch — GHA 는 icn1 프록시 경유(한국 IP),
// 로컬(사장님 PC)은 직접. url → Uint8Array | null.
async function fetchBinViaProxy(url) {
  if (USE_PROXY) {
    const r = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "X-API-Key": PROXY_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ url, method: "GET", headers: { "User-Agent": USER_AGENT } }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return new Uint8Array(Buffer.from(d.bodyB64, "base64"));
  }
  const r = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) return null;
  return new Uint8Array(await r.arrayBuffer());
}

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

// 2026-06-01 — 부산진구 보도자료 게시판 교정. 기존 BBS_0000265 는 "신발산업 특구"
// 전용(최신 2025-05, 저빈도)이라 일반 보도자료 누락. 진짜 보도자료는 BBS_0000031
// (소통참여>보도자료, 최신 26.05.18 활발). 본문은 동일 div.substan(라이브 462자 검증).
export const scrapeBusanjin = makeScraper({
  cityName: "부산진구",
  listUrl: "https://www.busanjin.go.kr/board/list.busanjin?boardId=BBS_0000031&menuCd=DOM_000000110003000000&contentsSid=319&cpath=",
  bodySelectors: [".substan"],
});

// 2026-05-29 — 금정구. 본문 td.contents (colspan).
// 2026-06-10 — board 교정: BBS_0000004 는 공지/안내(거의 비활성, 최신 05-26→05-06→2021)
//   오등록이었음. 진짜 보도자료는 BBS_0000005(거의 매일 발행: 청년·소상공인·복지 등). 홈
//   index.geumj 섹션 매핑(공지사항=0004, 보도자료=0005)으로 확인. busanjin BBS_0000265→0000031 류.
export const scrapeGeumjeong = makeScraper({
  cityName: "금정구",
  listUrl: "https://www.geumjeong.go.kr/board/list.geumj?boardId=BBS_0000005",
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

// 2026-06-02 — 수원시. 정적 collector(BD_board)는 본문이 JS 렌더(.p-table__content)라
// parseDetailBody 가 메타/제목만(68자) 잡아 누적 thin 이었음 → Playwright 경로 이관.
// list table tbody tr + 제목 onclick jsView('1043','17자리id') → BD_board.view.do?seq=id GET.
// 본문 .p-table__content (라이브 렌더 검증: detail 컨테이너 783자, factory 제목 결합 후 928~1212자).
export const scrapeSuwon = makeScraper({
  cityName: "수원시",
  listUrl: "https://www.suwon.go.kr/web/board/BD_board.list.do?bbsCd=1043",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  listSelectors: ["table tbody tr"],
  onclickIdRe: "jsView\\('1043',\\s*'(\\d+)'",
  detailPath: "BD_board.view.do?bbsCd=1043&seq={id}",
  bodySelectors: [".p-table__content"],
});

// 2026-06-08 — 평택시. 정적 collector(pyeongtaek.ts)는 list/본문 다 정상이나 평택이
// ASN 차단 site 라 Vercel cron 직접 fetch 0건 → GHA+icn1 프록시 경로로 이관.
// 목록 ul.blog_list li, 상세 id 는 a[data-req-get-p-idx] 속성(onclick 아님).
// 본문 .view_cont 안 .mT10 div(메타 제외). 정적 검증: list 10 + 본문 852자.
export const scrapePyeongtaek = makeScraper({
  cityName: "평택시",
  listUrl: "https://www.pyeongtaek.go.kr/pyeongtaek/board/post/list.do?bcIdx=90&mid=0402010000",
  listSelectors: ["ul.blog_list li", ".blog_list li"],
  attrIdName: "data-req-get-p-idx",
  detailPath: "view.do?bcIdx=90&mid=0402010000&idx={id}",
  titleSelectors: ["span.list_title", ".list_title"],
  bodySelectors: [".view_cont .mT10", ".view_cont"],
});

// 2026-06-08 — 양천구. 정적 collector(yangcheon.ts)는 list/본문 다 정상이나 ASN 차단
// site 라 Vercel cron 0건 → GHA+icn1 경로 이관. 상세 onclick doBbsFView('290','id'),
// 본문 .view_contents. 정적 검증: list 10 + 본문 2154자.
export const scrapeYangcheon = makeScraper({
  cityName: "양천구",
  listUrl: "https://www.yangcheon.go.kr/site/yangcheon/ex/bbs/List.do?cbIdx=290",
  // 범용 LIST_SELECTORS 는 사이드 위젯 ul(li[class*=item] 6개)을 먼저 잡아 0건이 됨.
  // 게시판은 table.basic-list tbody tr (a 조상 체인 확인).
  listSelectors: ["table.basic-list tbody tr", "table tbody tr"],
  onclickIdRe: "doBbsFView\\('290','(\\d+)'",
  detailPath: "View.do?cbIdx=290&bcIdx={id}",
  // 제목이 a 안 document.write(wdigm_title('제목')) JS 인자 (렌더돼도 텍스트로 남음).
  titleTextRe: "wdigm_title\\('([^']*)'\\)",
  bodySelectors: [".view_contents"],
});

// 2026-06-08 — 은평구. SI 표준(table.p-table, selectBbsNttView href 직접). 본문은
// .p-table__content 가 JS(한컴 웹에디터) 렌더라 정적 cron 0건 → Playwright 이관.
// 렌더 후 본문 666자 검증.
export const scrapeEunpyeong = makeScraper({
  cityName: "은평구",
  listUrl: "https://www.ep.go.kr/www/selectBbsNttList.do?bbsNo=48&key=762",
  listSelectors: ["table.p-table tbody tr"],
  bodySelectors: [".p-table__content"],
});

// 2026-06-08 — SI 첨부 본문 자치구 공용 팩토리(성동·동대문·성북). 웹 본문 셀은 요약
//   100~155자, 전문은 hwp/pdf 첨부에만(ASN 차단이라 정적 cron 0건). makeScraper(textContent)
//   로 안 되므로 별도 scraper: SI list 파싱 + 첨부 다운로드(icn1 프록시) → @ohah/unpdf 파싱.
//   base/bbsNo/key 만 다름. 짧은 bbsNo(39·46) prefix 충돌은 종결자 (?:&|") 로 차단.
//   runner 의 fn({limit}) 인터페이스 동일(items 반환).
function makeSiAttachScraper({ listUrl, detailDir, bbsNo, key }) {
  return async function scrape({ limit = 10 } = {}) {
    const listBuf = await fetchBinViaProxy(listUrl);
    if (!listBuf) return [];
    const html = Buffer.from(listBuf).toString("utf8");
    const re = new RegExp(
      `<a[^>]*href="[^"]*selectBbsNttView\\.do\\?(?=[^"]*bbsNo=${bbsNo}(?:&|"))[^"]*?nttNo=(\\d+)[^"]*"[^>]*>([\\s\\S]{0,900}?)<\\/a>`,
      "g",
    );
    const items = [];
    const seen = new Set();
    let m;
    while ((m = re.exec(html)) !== null && items.length < limit) {
      const seq = m[1];
      if (seen.has(seq)) continue;
      seen.add(seq);
      const title = m[2]
        .replace(/<span[^>]*p-icon[^>]*>[\s\S]*?<\/span>/gi, "") // "NEW" 새글 배지 span 제거
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
      // SI anchor 가 href 파라미터 체인으로 길어(716자+) 날짜 td 가 anchor+1315 위치라
      // 2000 buffer 필요(동대문·성북). 800 이면 날짜 누락 → published_at=now() fallback.
      const slice = html.slice(m.index, m.index + 2000);
      // month(1-12)/day(1-31) 범위 검증 — factory parseListDate 와 동일 가드. 이전엔 검증이
      // 없어 2000자 window 안 비-날짜 숫자(버전·ID·바이트수 등)를 날짜로 오매칭해 엉뚱한
      // published_at("오늘 새 정책" 거짓)이 될 수 있었음(SI 경로만 사각이었음).
      const dm = slice.match(/(\d{4})[.\-](\d{2})[.\-](\d{2})/);
      let publishedDate = null;
      if (dm) {
        const mo = parseInt(dm[2], 10);
        const dy = parseInt(dm[3], 10);
        if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
          publishedDate = `${dm[1]}-${dm[2]}-${dm[3]}`;
        }
      }
      items.push({
        title,
        publishedDate,
        sourceUrl: `${detailDir}selectBbsNttView.do?bbsNo=${bbsNo}&nttNo=${seq}&key=${key}`,
      });
    }
    const out = [];
    for (const it of items) {
      try {
        const dBuf = await fetchBinViaProxy(it.sourceUrl);
        if (!dBuf) continue;
        const dHtml = Buffer.from(dBuf).toString("utf8");
        const body = await fetchSiAttachBody(dHtml, detailDir, fetchBinViaProxy);
        if (body) out.push({ ...it, body });
      } catch {
        // skip
      }
    }
    return out;
  };
}

// 성동(hwp 첨부, 로컬 검증 1381자) — 2026-06-08
export const scrapeSeongdong = makeSiAttachScraper({
  listUrl: "https://www.sd.go.kr/main/selectBbsNttList.do?bbsNo=188&key=1477",
  detailDir: "https://www.sd.go.kr/main/",
  bbsNo: 188,
  key: 1477,
});

// 동대문(SI 첨부, bbsNo=39 짧음) — 2026-06-08
export const scrapeDongdaemun = makeSiAttachScraper({
  listUrl: "https://www.ddm.go.kr/www/selectBbsNttList.do?bbsNo=39&key=199",
  detailDir: "https://www.ddm.go.kr/www/",
  bbsNo: 39,
  key: 199,
});

// 성북(SI 첨부, bbsNo=46 짧음) — 2026-06-08
export const scrapeSeongbuk = makeSiAttachScraper({
  listUrl: "https://www.sb.go.kr/www/selectBbsNttList.do?bbsNo=46&key=6356",
  detailDir: "https://www.sb.go.kr/www/",
  bbsNo: 46,
  key: 6356,
});

// 2026-06-08 — 강남구. 본문이 한컴 웹에디터(div 는 JS 렌더 빈칸)라 정적 cron 0건.
// 평문 본문은 hidden input#content_main_text value 에 서버 렌더 → bodyValueSelector 로 추출.
// 목록 tr.grid-item(table.table), 상세 view.do href 직접. 렌더 후 본문 706자 검증.
export const scrapeGangnam = makeScraper({
  cityName: "강남구",
  listUrl: "https://www.gangnam.go.kr/board/B_000031/list.do?mid=ID01_031",
  listSelectors: ["tr.grid-item", "table.table tbody tr"],
  bodyValueSelector: "#content_main_text",
});

// 2026-06-08 — 제주도. 정적 collector 가 prod 미수집(ASN 차단, 한국 IP 200). 목록
// li.board-news__article + 제목 strong.text-ellipsis, 상세 list.htm?act=view&seq= href 직접,
// 본문 .article-contents. GHA+icn1 경로 이관.
export const scrapeJeju = makeScraper({
  cityName: "제주도",
  listUrl: "https://www.jeju.go.kr/news/bodo/list.htm",
  listSelectors: ["li.board-news__article"],
  titleSelectors: ["strong.text-ellipsis", ".text-ellipsis"],
  bodySelectors: [".article-contents"],
});

// 2026-06-08 — 인천 남동구. bbsMsg CMS(report.jsp) + ASN 차단(prod 403, 한국 IP 200).
//   목록 ul.generalList li + 제목 p.title, 상세 bbsMsgDetail.do?msg_seq= href 직접,
//   본문 .board_view. 로컬 검증 983자. GHA+icn1 경로 이관.
export const scrapeNamdongIncheon = makeScraper({
  cityName: "인천 남동구",
  listUrl: "https://www.namdong.go.kr/main/news/report.jsp",
  // generalList 는 80행(첨부·메뉴 혼재, fileDown 만 가진 li 포함) → bbsMsgDetail 링크를
  // 가진 게시판 글 li 만 :has 로 한정.
  listSelectors: [
    "ul.generalList li:has(a[href*='bbsMsgDetail'])",
    "div.board_list li:has(a[href*='bbsMsgDetail'])",
  ],
  titleSelectors: ["p.title", ".title"],
  bodySelectors: [".board_view"],
});

// 2026-06-08 — 의정부시. ASN 차단 + 사이트 개편으로 보도자료가 contents.do?mId=0301020000
//   동적 게시판(내부 bbs/list.do ajax). list.do 직접은 메인페이지 0건이라 contents.do 를 listUrl 로.
//   목록 div.bod_blog ul li, 상세 onclick boardView('portal','listForm','코드','Y','bIdx',...).
//   본문 view_cont 류. (행 selector 발굴 완료)
export const scrapeUijeongbu = makeScraper({
  cityName: "의정부시",
  listUrl: "https://www.ui4u.go.kr/portal/contents.do?mId=0301020000",
  listSelectors: ["div.bod_blog ul li", ".bod_blog li"],
  onclickIdRe: "boardView\\([^)]*?'(\\d{4,})'",
  detailPath: "bbs/view.do?bIdx={id}&mId=0301020000&ptIdx=1709",
  bodySelectors: [".view_cont", ".board_view", ".bbs_view", ".p-view__content", ".view_content"],
  // 제목: span.blog_tit (li 전체 a 는 본문요약까지 포함해 제목 오염). [행사]/[환경] 카테고리
  // prefix 는 titleTextRe 로 제거.
  titleSelectors: ["span.blog_tit", ".blog_tit"],
  titleTextRe: "^\\[[^\\]]+\\]\\s*(.+)$",
  // contents.do 동적 wrapper 가 icn1 프록시로 무겁고 불안정 → commit(초기 응답 즉시)으로
  // 진행 후 div.bod_blog ajax 를 waitForSelector 로 대기. timeout 120s 마진.
  navWait: "commit",
  listTimeout: 120000,
});

// 2026-06-08 — 광주남구: 이관 불가 확정. board.es 본문이 raw·DOM·ajax 어디에도 텍스트로 없음
//   (8가지 발굴 실패, POST/세션/암호화 또는 이미지·첨부 위주 추정). 더 파지 말 것.

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
    suwon: scrapeSuwon,
    pyeongtaek: scrapePyeongtaek,
    yangcheon: scrapeYangcheon,
    eunpyeong: scrapeEunpyeong,
    gangnam: scrapeGangnam,
    seongdong: scrapeSeongdong,
    dongdaemun: scrapeDongdaemun,
    seongbuk: scrapeSeongbuk,
    jeju: scrapeJeju,
    namdong_incheon: scrapeNamdongIncheon,
    uijeongbu: scrapeUijeongbu,
  };
  const fn = map[target];
  if (!fn) {
    console.error(`unknown city: ${target}. 사용: changwon|seongnam|ansan|cheonan|nowon|dongnae|busanjin|geumjeong|sasang|sasang_news|gimpo|yeongdo|suwon|pyeongtaek|yangcheon|eunpyeong|gangnam|seongdong|dongdaemun|seongbuk|jeju`);
    process.exit(1);
  }
  const items = await fn({ limit: 3, headless: true });
  console.log(`[${target}] fetched ${items.length} items`);
  for (const it of items) {
    console.log(`  ${it.publishedDate ?? "-"} | ${it.title.slice(0, 60)}`);
    console.log(`    body ${it.body.length}자: ${it.body.slice(0, 80)}...`);
  }
}
