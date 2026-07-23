// ============================================================
// 시·군 collector 등록부 — single source of truth (5/17)
// ============================================================
// 시·군 추가 시 여기 한 곳에만 추가. cron route + admin actions + UI 가 모두 import.
//
// Dead code anti-pattern 방지: 이전엔 cron COLLECTORS + actions.ts COLLECTORS 가
// 따로 정의돼 신규 시·군 추가 시 한 쪽만 갱신되는 회귀가 반복 발생.
// ============================================================

import type { createAdminClient } from "@/lib/supabase/admin";
import type { ScrapeResult } from "./_factory";
import { scrapeSuncheonAndInsert } from "./suncheon";
import { scrapeGwangjuAndInsert } from "./gwangju";
import { scrapeSeoulAndInsert } from "./seoul";
import { scrapeBusanAndInsert } from "./busan";
import { scrapeIncheonAndInsert } from "./incheon";
import { scrapeDaejeonAndInsert } from "./daejeon";
import { scrapeUlsanAndInsert } from "./ulsan";
import { scrapeGoyangAndInsert } from "./goyang";
import { scrapeYonginAndInsert } from "./yongin";
import { scrapeCheongjuAndInsert } from "./cheongju";
import { scrapeHwaseongAndInsert } from "./hwaseong";
import { scrapeJeonjuAndInsert } from "./jeonju";
import { scrapeGimhaeAndInsert } from "./gimhae";
import { scrapeNamyangjuAndInsert } from "./namyangju";
import { scrapePajuAndInsert } from "./paju";
// 2026-06-08 disabled (ASN 차단 → GHA+icn1 playwright 경로 이관): import { scrapePyeongtaekAndInsert } from "./pyeongtaek";
import { scrapePohangAndInsert } from "./pohang";
import { scrapeIksanAndInsert } from "./iksan";
import { scrapeDaeguAndInsert } from "./daegu";
import { scrapeSejongAndInsert } from "./sejong";
import { scrapeJeonnamAndInsert } from "./jeonnam";
import { scrapeGyeonggiAndInsert } from "./gyeonggi";
import { scrapeJeonbukAndInsert } from "./jeonbuk";
import { scrapeGyeongnamAndInsert } from "./gyeongnam";
import { scrapeGyeongbukAndInsert } from "./gyeongbuk";
import { scrapeChungnamAndInsert } from "./chungnam";
import { scrapeChungbukAndInsert } from "./chungbuk";
import { scrapeGangwonAndInsert } from "./gangwon";
// 2026-06-08 disabled (ASN 차단 → GHA+icn1 playwright 경로 이관): import { scrapeJejuAndInsert } from "./jeju";
// 2026-06-08 disabled (본문 JS 렌더 → GHA+icn1 playwright 경로 이관): import { scrapeGangnamAndInsert } from "./gangnam";
// 2026-05-29 disabled (본문 elusive → playwright PC 러너로 이관): import { scrapeNowonAndInsert } from "./nowon";
import { scrapeSongpaAndInsert } from "./songpa";
import { scrapeAnyangAndInsert } from "./anyang";
import { scrapeUiwangAndInsert } from "./uiwang";
import { scrapeWonjuAndInsert } from "./wonju";
import { scrapeGwangsanAndInsert } from "./gwangsan";
import { scrapeGunpoAndInsert } from "./gunpo";
import { scrapeYangjuAndInsert } from "./yangju";
import { scrapeBupyeongAndInsert } from "./bupyeong";
import { scrapeYeonsuAndInsert } from "./yeonsu";
import { scrapeSeoIncheonAndInsert } from "./seo_incheon";
import { scrapeHanamAndInsert } from "./hanam";
import { scrapeGuriAndInsert } from "./guri";
import { scrapeChungjuAndInsert } from "./chungju";
import { scrapeYeosuAndInsert } from "./yeosu";
import { scrapeMokpoAndInsert } from "./mokpo";
import { scrapeGwangyangAndInsert } from "./gwangyang";
// 2026-05-30 — 기장군 eminwon 별도 시스템(OfrAction.do POST). 기존 gijang.ts
// (BBS_0000001 정적, 0건) 폐기 후 gijang-eminwon.ts(POST+parser) 로 교체.
// 기존 ts 파일은 다음 cleanup 세션에 삭제.
import { scrapeGijangEminwonAndInsert } from "./gijang-eminwon";
// 2026-06-01 — 부산 북구도 eminwon(기장과 동일 OfrAction.do POST). 기존 proxy 경로
// (BBS_0000012=공동주택 오등록, 0건) 폐기 후 eminwon 으로 재이관 (dead-path swap).
import { scrapeBsbukguEminwonAndInsert } from "./bsbukgu-eminwon";
import { scrapeYuseongEminwonAndInsert } from "./yuseong-eminwon";
import { scrapeDongguDaejeonAndInsert } from "./donggu_daejeon";
import { scrapeJungguDaejeonAndInsert } from "./junggu_daejeon";
import { scrapeDaedeokAndInsert } from "./daedeok";
import { scrapeGongjuAndInsert } from "./gongju";
import { scrapeBoryeongAndInsert } from "./boryeong";
import { scrapeAsanAndInsert } from "./asan";
import { scrapeNonsanAndInsert } from "./nonsan";
import { scrapeGyeryongAndInsert } from "./gyeryong";
import { scrapeDangjinAndInsert } from "./dangjin";
import { scrapeGeumsanAndInsert } from "./geumsan";
import { scrapeBuyeoAndInsert } from "./buyeo";
import { scrapeSeocheonAndInsert } from "./seocheon";
import { scrapeCheongyangAndInsert } from "./cheongyang";
import { scrapeHongseongAndInsert } from "./hongseong";
import { scrapeYesanAndInsert } from "./yesan";
import { scrapeTaeanAndInsert } from "./taean";
import { scrapeJeongeupAndInsert } from "./jeongeup";
import { scrapeNamwonAndInsert } from "./namwon";
import { scrapeGimjeAndInsert } from "./gimje";
import { scrapeWanjuAndInsert } from "./wanju";
import { scrapeJinanAndInsert } from "./jinan";
import { scrapeMujuAndInsert } from "./muju";
import { scrapeJangsuAndInsert } from "./jangsu";
import { scrapeSunchangAndInsert } from "./sunchang";
import { scrapeBuanAndInsert } from "./buan";
import { scrapeGochangAndInsert } from "./gochang";
import { scrapeNajuAndInsert } from "./naju";
import { scrapeDamyangAndInsert } from "./damyang";
import { scrapeGuryeAndInsert } from "./gurye";
import { scrapeGokseongAndInsert } from "./gokseong";
import { scrapeGoheungAndInsert } from "./goheung";
import { scrapeBoseongAndInsert } from "./boseong";
import { scrapeHwasunAndInsert } from "./hwasun";
import { scrapeGangjinAndInsert } from "./gangjin";
import { scrapeJangheungAndInsert } from "./jangheung";
import { scrapeYeongamAndInsert } from "./yeongam";
import { scrapeMuanAndInsert } from "./muan";
import { scrapeYeonggwangAndInsert } from "./yeonggwang";
import { scrapeSeosanAndInsert } from "./seosan";
import { scrapeGangneungAndInsert } from "./gangneung";
import { scrapeTaebaekAndInsert } from "./taebaek";
import { scrapeSamcheokAndInsert } from "./samcheok";
import { scrapeChuncheonAndInsert } from "./chuncheon";
import { scrapeHongcheonAndInsert } from "./hongcheon";
import { scrapeCheorwonAndInsert } from "./cheorwon";
import { scrapeDonghaeAndInsert } from "./donghae";
import { scrapeJecheonAndInsert } from "./jecheon";
import { scrapeOkcheonAndInsert } from "./okcheon";
import { scrapeBoeunAndInsert } from "./boeun";
import { scrapeGoesanAndInsert } from "./goesan";
import { scrapeDanyangAndInsert } from "./danyang";
import { scrapeEumseongAndInsert } from "./eumseong";
import { scrapeJincheonAndInsert } from "./jincheon";
import { scrapeYeongdongAndInsert } from "./yeongdong";
import { scrapeJeungpyeongAndInsert } from "./jeungpyeong";
import { scrapeOngjinAndInsert } from "./ongjin";
// 2026-07-22 disabled: icjg.go.kr now serves a small /index.html shell to
// Vercel/static fetch, so the legacy krop0231c parser records fetched=0 with
// no useful error. Keep the collector file for a future PC/Playwright-specific
// recovery, but exclude it from the static cron/stale health target set.
// import { scrapeJungguIncheonAndInsert } from "./junggu_incheon";
import { scrapeGanghwaAndInsert } from "./ganghwa";
import { scrapeDongguIncheonAndInsert } from "./donggu_incheon";
import { scrapeNamguGwangjuAndInsert } from "./namgu_gwangju";
// 2026-06-07 — 광주 북구도 eminwon 으로 재이관. 기존 board.es(mid=a10402010000=
// 희망아카데미 강연 안내 오등록, 누적 1건) 폐기 후 eminwon(OfrAction.do POST) 으로
// 교체 (부산 북구 6/1 과 동일 dead-path swap).
import { scrapeBukguGwangjuEminwonAndInsert } from "./bukgu-gwangju-eminwon";
import { scrapeSeoguGwangjuAndInsert } from "./seogu_gwangju";
import { scrapeDongguGwangjuAndInsert } from "./donggu_gwangju";
// 2026-06-08 disabled (ASN 403 → GHA+icn1 playwright 경로 이관): import { scrapeNamdongIncheonAndInsert } from "./namdong_incheon";
import { scrapeGyeyangIncheonAndInsert } from "./gyeyang_incheon";
import { scrapeMichuholAndInsert } from "./michuhol_incheon";
// 2026-05-31 — 서울 18 자치구 확장 패턴 1 (eGovFrame portal/bbs): 광진·동작·용산
import { scrapeGwangjinAndInsert } from "./gwangjin";
import { scrapeDongjakAndInsert } from "./dongjak";
import { scrapeYongsanAndInsert } from "./yongsan";
// 2026-05-31 — 서울 18 자치구 확장 패턴 3 (/site/main/board/press): 마포
import { scrapeMapoAndInsert } from "./mapo";
// 2026-05-31 — 서울 18 자치구 확장 패턴 4 (ASP 클래식 bbs.asp): 도봉
import { scrapeDobongAndInsert } from "./dobong";
// 2026-05-31 — 서울 18 자치구 확장 패턴 5 (eGovFrame site/ex/bbs JS onclick): 관악·양천
import { scrapeGwanakAndInsert } from "./gwanak";
// 2026-06-08 disabled (ASN 차단 → GHA+icn1 playwright 경로 이관): import { scrapeYangcheonAndInsert } from "./yangcheon";
// 2026-06-01 — 서울 자치구 확장 (SI selectBbsNttList — 송파·군포 동일 CMS): 성동·영등포·은평
// 2026-06-08 disabled (hwp 첨부 본문 → GHA+icn1 playwright 경로 이관): import { scrapeSeongdongAndInsert } from "./seongdong";
import { scrapeYeongdeungpoAndInsert } from "./yeongdeungpo";
// 2026-06-08 disabled (본문 JS 렌더 → GHA+icn1 playwright 경로 이관): import { scrapeEunpyeongAndInsert } from "./eunpyeong";
// 2026-06-01 — 서대문구 구정뉴스 (EUC-KR 사이트, factory encoding opt-in + goView GET).
import { scrapeSeodaemunAndInsert } from "./seodaemun";
// 2026-06-01 — 금천구 보도자료 (SI 표준, bbsNo=8. 메인 메뉴 150151 은 영상 갤러리라 회피).
import { scrapeGeumcheonAndInsert } from "./geumcheon";
// 2026-06-01 — 강서구 보도자료 (eDotXpress CMS, /gs040201/{id} 정적, view-content 본문).
import { scrapeGangseoAndInsert } from "./gangseo";
// 2026-06-01 — 종로구 보도자료 (eGovFrame selectBoardList bbsId=1618, viewMove nttId).
import { scrapeJongnoAndInsert } from "./jongno";
// 2026-06-01 — 구로·동대문 보도자료 (SI 표준. 메인 빈 shell → /www/index.do 가 실제 콘텐츠).
import { scrapeGuroAndInsert } from "./guro";
// 2026-06-08 disabled (SI 첨부 본문 → GHA+icn1 playwright 경로 이관): import { scrapeDongdaemunAndInsert } from "./dongdaemun";
// 2026-06-01 — 서초(eGovFrame site/ex/bbs cbIdx=61)·서울 중구(content.do cmsid=14390).
import { scrapeSeochoAndInsert } from "./seocho";
import { scrapeJungguSeoulAndInsert } from "./junggu_seoul";
// 2026-06-01 — 성북구 보도자료 (SI 표준 bbsNo=46. 메인 빈 shell → /www/index.do).
// 2026-06-08 disabled (SI 첨부 본문 → GHA+icn1 playwright 경로 이관): import { scrapeSeongbukAndInsert } from "./seongbuk";
// 2026-06-01 — 강동구 보도자료 (newportal CMS, /web/newportal/press/{id} 정적).
import { scrapeGangdongAndInsert } from "./gangdong";
// 2026-06-01 — 대전 서구 보도자료 (eGovFrame bbs, fn_search_detail nttId GET).
import { scrapeSeoguDaejeonAndInsert } from "./seogu_daejeon";
// disabled 2026-05-24 (review): 의정부 검증 후 재enable
// import { scrapeUijeongbuAndInsert } from "./uijeongbu";

export type CityKey =
  | "suncheon"
  | "gwangju"
  | "seoul"
  | "busan"
  | "incheon"
  | "daejeon"
  | "ulsan"
  | "goyang"
  | "yongin"
  | "cheongju"
  | "hwaseong"
  | "jeonju"
  | "gimhae"
  | "namyangju"
  | "paju"
  // | "pyeongtaek" — 2026-06-08 disabled (→ GHA+icn1 playwright 경로)
  | "pohang"
  | "iksan"
  | "daegu"
  | "sejong"
  | "jeonnam"
  | "gyeonggi"
  | "jeonbuk"
  | "gyeongnam"
  | "gyeongbuk"
  | "chungnam"
  | "chungbuk"
  | "gangwon"
  // | "jeju" — 2026-06-08 disabled (→ GHA+icn1 playwright 경로)
  // | "gangnam" — 2026-06-08 disabled (→ GHA+icn1 playwright 경로)
  // | "nowon" — 2026-05-29 disabled (→ playwright PC 러너)
  | "songpa"
  | "anyang"
  | "uiwang"
  | "wonju"
  | "gwangsan"
  | "gunpo"
  | "yangju"
  | "bupyeong"
  | "yeonsu"
  | "seo_incheon"
  | "hanam"
  | "guri"
  | "chungju"
  | "yeosu"
  | "mokpo"
  | "gwangyang"
  | "namgu_gwangju"
  | "bukgu_gwangju"
  | "seogu_gwangju"
  | "donggu_gwangju"
  // | "namdong_incheon" — 2026-06-08 disabled (→ GHA+icn1 playwright 경로)
  | "gyeyang_incheon"
  | "michuhol_incheon"
  | "gijang"
  | "bsbukgu"
  | "yuseong"
  | "donggu_daejeon"
  | "junggu_daejeon"
  | "daedeok"
  | "gongju"
  | "boryeong"
  | "asan"
  | "nonsan"
  | "gyeryong"
  | "dangjin"
  | "geumsan"
  | "buyeo"
  | "seocheon"
  | "cheongyang"
  | "hongseong"
  | "yesan"
  | "taean"
  | "jeongeup"
  | "namwon"
  | "gimje"
  | "wanju"
  | "jinan"
  | "muju"
  | "jangsu"
  | "sunchang"
  | "buan"
  | "gochang"
  | "naju"
  | "damyang"
  | "gurye"
  | "gokseong"
  | "goheung"
  | "boseong"
  | "hwasun"
  | "gangjin"
  | "jangheung"
  | "yeongam"
  | "muan"
  | "yeonggwang"
  | "seosan"
  | "gangneung"
  | "taebaek"
  | "samcheok"
  | "chuncheon"
  | "hongcheon"
  | "cheorwon"
  | "donghae"
  | "jecheon"
  | "okcheon"
  | "boeun"
  | "goesan"
  | "danyang"
  | "eumseong"
  | "jincheon"
  | "yeongdong"
  | "jeungpyeong"
  | "ongjin"
  // | "junggu_incheon" — 2026-07-22 disabled (static fetch sees /index.html shell; needs PC/Playwright recovery)
  | "ganghwa"
  | "donggu_incheon"
  // 2026-05-31 서울 18 자치구 확장 (패턴 1: eGovFrame portal/bbs)
  | "gwangjin"
  | "dongjak"
  | "yongsan"
  // 2026-05-31 서울 18 자치구 확장 (패턴 3: /site/main/board/press)
  | "mapo"
  // 2026-05-31 서울 18 자치구 확장 (패턴 4: ASP 클래식 bbs.asp)
  | "dobong"
  // 2026-05-31 서울 18 자치구 확장 (패턴 5: eGovFrame site/ex/bbs JS onclick)
  | "gwanak"
  // | "yangcheon" — 2026-06-08 disabled (→ GHA+icn1 playwright 경로)
  // 2026-06-01 서울 자치구 확장 (SI selectBbsNttList)
  // | "seongdong" — 2026-06-08 disabled (→ GHA+icn1 playwright 경로)
  | "yeongdeungpo"
  // | "eunpyeong" — 2026-06-08 disabled (→ GHA+icn1 playwright 경로)
  // 2026-06-01 서대문구 (EUC-KR 구정뉴스 goView GET)
  | "seodaemun"
  // 2026-06-01 금천구 (SI 보도자료 bbsNo=8)
  | "geumcheon"
  // 2026-06-01 강서구 (eDotXpress /gs040201)
  | "gangseo"
  // 2026-06-01 종로구 (eGovFrame selectBoardList bbsId=1618)
  | "jongno"
  // 2026-06-01 구로·동대문 (SI selectBbsNttList)
  | "guro"
  // | "dongdaemun" — 2026-06-08 disabled (→ GHA+icn1 playwright 경로)
  // 2026-06-01 서초(site/ex/bbs)·서울 중구(content.do)
  | "seocho"
  | "junggu_seoul"
  // 2026-06-01 성북구 (SI selectBbsNttList bbsNo=46)
  // | "seongbuk" — 2026-06-08 disabled (→ GHA+icn1 playwright 경로)
  // 2026-06-01 강동구 (newportal /web/newportal/press)
  | "gangdong"
  // 2026-06-01 대전 서구 (eGovFrame bbs fn_search_detail)
  | "seogu_daejeon";
// | "uijeongbu" — disabled 2026-05-24 (review)

export type CityEntry = {
  key: CityKey;
  city: string; // 한국어 시·군 이름 (audit + UI 표시)
  ministry: string; // collector insert 시 표준 ministry (audit details.ministry)
  ministryAliases?: string[]; // 외부 언론 path 가 다른 표기로 저장한 경우 누적 카운트 시 같이 매칭
  siteUrl: string; // 시청 보도자료 사이트 (UI link)
  fn: (
    admin: ReturnType<typeof createAdminClient>,
    limit?: number,
  ) => Promise<ScrapeResult>;
};

// 추가 순서 = cron 실행 순서 = UI 표시 순서. 시·군 인구/등록 시간 순.
export const CITY_REGISTRY: CityEntry[] = [
  {
    key: "suncheon",
    city: "순천시",
    ministry: "전라남도 순천시",
    siteUrl: "http://www.suncheon.go.kr/kr/news/0006/0001/",
    fn: scrapeSuncheonAndInsert,
  },
  {
    key: "gwangju",
    city: "광주광역시",
    ministry: "광주광역시",
    siteUrl:
      "https://www.gwangju.go.kr/boardList.do?pageId=www789&boardId=BD_0000000027",
    fn: scrapeGwangjuAndInsert,
  },
  {
    key: "seoul",
    city: "서울특별시",
    ministry: "서울특별시청",
    ministryAliases: ["서울특별시"],
    siteUrl: "https://opengov.seoul.go.kr/press/list",
    fn: scrapeSeoulAndInsert,
  },
  {
    key: "busan",
    city: "부산광역시",
    ministry: "부산광역시청",
    ministryAliases: ["부산광역시"],
    siteUrl: "https://www.busan.go.kr/nbtnewsBU",
    fn: scrapeBusanAndInsert,
  },
  {
    key: "incheon",
    city: "인천광역시",
    ministry: "인천광역시청",
    ministryAliases: ["인천광역시"],
    siteUrl: "https://www.incheon.go.kr/IC010205",
    fn: scrapeIncheonAndInsert,
  },
  {
    key: "daejeon",
    city: "대전광역시",
    ministry: "대전광역시청",
    ministryAliases: ["대전광역시"],
    siteUrl:
      "https://www.daejeon.go.kr/drh/board/boardNormalList.do?boardId=normal_0189&menuSeq=6825",
    fn: scrapeDaejeonAndInsert,
  },
  {
    key: "ulsan",
    city: "울산광역시",
    ministry: "울산광역시청",
    ministryAliases: ["울산광역시"],
    siteUrl: "https://www.ulsan.go.kr/u/rep/main.ulsan",
    fn: scrapeUlsanAndInsert,
  },
  {
    key: "goyang",
    city: "고양특례시",
    ministry: "고양특례시청",
    siteUrl: "https://www.goyang.go.kr/news/news01/news01_01.jsp",
    fn: scrapeGoyangAndInsert,
  },
  {
    key: "yongin",
    city: "용인특례시",
    ministry: "용인특례시청",
    siteUrl: "https://www.yongin.go.kr/news/USR_NEWS00/list.do?mId=0202010000",
    fn: scrapeYonginAndInsert,
  },
  {
    key: "cheongju",
    city: "청주시",
    ministry: "청주시청",
    siteUrl:
      "https://www.cheongju.go.kr/www/selectBbsNttList.do?bbsNo=24&key=185",
    fn: scrapeCheongjuAndInsert,
  },
  {
    key: "hwaseong",
    city: "화성특례시",
    ministry: "화성특례시청",
    siteUrl:
      "https://www.hscity.go.kr/www/selectBbsNttList.do?bbsNo=46&key=257",
    fn: scrapeHwaseongAndInsert,
  },
  {
    key: "jeonju",
    city: "전주시",
    ministry: "전주시청",
    siteUrl: "https://www.jeonju.go.kr/planweb/board/list.9is?boardUid=8a8389b16e3b8c19016e3b9bca8c0008",
    fn: scrapeJeonjuAndInsert,
  },
  {
    key: "gimhae",
    city: "김해시",
    ministry: "김해시청",
    siteUrl: "https://www.gimhae.go.kr/03360/00023/00025.web",
    fn: scrapeGimhaeAndInsert,
  },
  {
    key: "namyangju",
    city: "남양주시",
    ministry: "남양주시청",
    siteUrl: "https://www.nyj.go.kr/main/1058",
    fn: scrapeNamyangjuAndInsert,
  },
  // 2026-06-11 — 파주시: eGovFrame BD_board(보도자료 bbsCd=1023). 목록 jsView onclick +
  //   슬래시 날짜, 본문 .article-body. "○월 ○일 보도자료" day-digest 형식(부천류, 매일 1건).
  {
    key: "paju",
    city: "파주시",
    ministry: "파주시청",
    siteUrl:
      "https://www.paju.go.kr/news/user/board/BD_board.list.do?bbsCd=1023&q_ctgCds=5226,5227,5229",
    fn: scrapePajuAndInsert,
  },
  // 2026-06-08 — 평택시: ASN 차단 site 라 Vercel cron 직접 fetch 0건(정적 parse 자체는
  //   정상). GHA+icn1 프록시 경로(playwright/lib/cities.mjs scrapePyeongtaek)로 이관.
  //   dual-path 방지로 정적 등록 제거. (pyeongtaek.ts·테스트는 정적 parse 회귀 방어로 유지)
  {
    key: "pohang",
    city: "포항시",
    ministry: "포항시청",
    siteUrl:
      "https://www.pohang.go.kr/news/board/post/list.do?bcIdx=644&mid=0102000000",
    fn: scrapePohangAndInsert,
  },
  {
    key: "iksan",
    city: "익산시",
    ministry: "익산시청",
    siteUrl:
      "http://www.iksan.go.kr/index.9is?menuUid=ff80808198eafcbd019902ab48032c02",
    fn: scrapeIksanAndInsert,
  },
  {
    key: "daegu",
    city: "대구광역시",
    ministry: "대구광역시청",
    ministryAliases: ["대구광역시"],
    siteUrl:
      "http://info.daegu.go.kr/newshome/mtnmain.php?mtnkey=scatelist&mkey=26",
    fn: scrapeDaeguAndInsert,
  },
  {
    key: "sejong",
    city: "세종특별자치시",
    ministry: "세종특별자치시청",
    ministryAliases: ["세종특별자치시"],
    siteUrl: "https://www.sejong.go.kr/bbs/R0079/list.do",
    fn: scrapeSejongAndInsert,
  },
  {
    key: "jeonnam",
    city: "전라남도",
    ministry: "전라남도청",
    ministryAliases: ["전라남도"],
    siteUrl:
      "https://www.jeonnam.go.kr/M7116/boardList.do?menuId=jeonnam0202000000",
    fn: scrapeJeonnamAndInsert,
  },
  {
    key: "gyeonggi",
    city: "경기도",
    ministry: "경기도청",
    ministryAliases: ["경기도"],
    siteUrl: "https://gnews.gg.go.kr/briefing/brief_gongbo.do",
    fn: scrapeGyeonggiAndInsert,
  },
  {
    key: "jeonbuk",
    city: "전북특별자치도",
    ministry: "전북특별자치도청",
    ministryAliases: ["전북특별자치도", "전라북도"],
    siteUrl:
      "https://www.jeonbuk.go.kr/newsroom/board/list.jeonbuk?boardId=BBS_0000090&menuCd=DOM_000001101000000000",
    fn: scrapeJeonbukAndInsert,
  },
  {
    key: "gyeongnam",
    city: "경상남도",
    ministry: "경상남도청",
    ministryAliases: ["경상남도"],
    siteUrl:
      "https://www.gyeongnam.go.kr/index.gyeong?menuCd=DOM_000000135002001000",
    fn: scrapeGyeongnamAndInsert,
  },
  {
    key: "gyeongbuk",
    city: "경상북도",
    ministry: "경상북도청",
    ministryAliases: ["경상북도"],
    siteUrl:
      "https://www.gb.go.kr/Main/page.do?BD_CODE=bbs_bodo&mnu_uid=6792",
    fn: scrapeGyeongbukAndInsert,
  },
  {
    key: "chungnam",
    city: "충청남도",
    ministry: "충청남도청",
    ministryAliases: ["충청남도"],
    siteUrl:
      "https://www.chungnam.go.kr/cnportal/cnapcPressList/cnapcPress/list.do?menuNo=500498",
    fn: scrapeChungnamAndInsert,
  },
  {
    key: "chungbuk",
    city: "충청북도",
    ministry: "충청북도청",
    ministryAliases: ["충청북도"],
    siteUrl:
      "https://www.chungbuk.go.kr/www/selectBbsNttList.do?bbsNo=65&key=429",
    fn: scrapeChungbukAndInsert,
  },
  {
    key: "gangwon",
    city: "강원특별자치도",
    ministry: "강원특별자치도청",
    ministryAliases: ["강원특별자치도", "강원도"],
    siteUrl: "https://state.gwd.go.kr/portal/briefing/pressRelease",
    fn: scrapeGangwonAndInsert,
  },
  // 2026-06-08 — 제주도: 정적 collector 가 prod 미수집(ASN 차단, 한국 IP 200). GHA+icn1
  //   경로(scrapeJeju)로 이관. dual-path 방지로 정적 등록 제거. (jeju.ts·테스트 유지)
  // 2026-06-08 — 강남구: 본문 한컴 웹에디터(div JS 렌더 빈칸, 평문은 hidden input value)
  //   라 정적 cron 0건. GHA+icn1 경로(scrapeGangnam, bodyValueSelector)로 이관.
  //   dual-path 방지로 정적 등록 제거. (gangnam.ts·테스트 유지)
  // 2026-05-29 disabled — 노원구 본문이 무클래스 span 조각이라 정적 추출 불가.
  // Playwright PC 러너(playwright/lib/cities.mjs scrapeNowon)로 이관. dual-path 방지.
  // {
  //   key: "nowon",
  //   city: "노원구",
  //   ministry: "노원구청",
  //   siteUrl:
  //     "https://www.nowon.kr/www/user/bbs/BD_selectBbsList.do?q_bbsCode=1027",
  //   fn: scrapeNowonAndInsert,
  // },
  // 2026-05-22 — 송파구 67만 (서울 자치구 1위). sub.do?key=2781 → selectBbsNttList.do redirect SI 표준.
  {
    key: "songpa",
    city: "송파구",
    ministry: "송파구청",
    siteUrl:
      "https://www.songpa.go.kr/www/selectBbsNttList.do?bbsNo=96&key=2781",
    fn: scrapeSongpaAndInsert,
  },
  // 2026-05-22 — 안양시 55만. SI 표준 specialized endpoint (selectPressReleaseList).
  {
    key: "anyang",
    city: "안양시",
    ministry: "안양시청",
    siteUrl:
      "https://anyang.go.kr/main/selectPressReleaseList.do?bbsNo=1687&key=4107",
    fn: scrapeAnyangAndInsert,
  },
  // 2026-05-22 — 의왕시 16만. 자체 system (UWKORINFO0201 path), 5,864+ 보도자료.
  {
    key: "uiwang",
    city: "의왕시",
    ministry: "의왕시청",
    siteUrl: "https://www.uiwang.go.kr/UWKORINFO0201/",
    fn: scrapeUiwangAndInsert,
  },
  // 2026-05-29 — 김포시는 Playwright 프록시 경로로 이관(목록 위젯 혼재·본문 무class td 라
  // 정적 selector 불가). 정적 등록 제거(dual-path 방지).
  // 2026-05-22 — 원주시 35만. SI 표준 + 40,744+ 보도자료 (강원 1위).
  {
    key: "wonju",
    city: "원주시",
    ministry: "원주시청",
    siteUrl:
      "https://www.wonju.go.kr/www/selectBbsNttList.do?bbsNo=145&key=222",
    fn: scrapeWonjuAndInsert,
  },
  // 2026-05-22 — 광산구 40만 (광주광역시 자치구). 광주광역시 와 동일 system.
  {
    key: "gwangsan",
    city: "광산구",
    ministry: "광산구청",
    siteUrl:
      "https://www.gwangsan.go.kr/boardList.do?boardId=REPORT_NEW&pageId=www16",
    fn: scrapeGwangsanAndInsert,
  },
  // 2026-05-22 — 군포시 26만. SI 표준 + 12,277+ 보도자료.
  {
    key: "gunpo",
    city: "군포시",
    ministry: "군포시청",
    siteUrl:
      "https://www.gunpo.go.kr/www/selectBbsNttList.do?bbsNo=685&key=3893",
    fn: scrapeGunpoAndInsert,
  },
  // 2026-05-22 — 양주시 27만. SI 표준 "양주소식".
  {
    key: "yangju",
    city: "양주시",
    ministry: "양주시청",
    siteUrl:
      "https://www.yangju.go.kr/www/selectBbsNttList.do?bbsNo=13&key=202",
    fn: scrapeYangjuAndInsert,
  },
  // 2026-05-22 — 부평구 47만 (인천광역시). 24,127+ 보도자료. 자체 system (bbsMsgDetail).
  {
    key: "bupyeong",
    city: "부평구",
    ministry: "부평구청",
    siteUrl: "https://www.icbp.go.kr/main/participation/news/report.jsp",
    fn: scrapeBupyeongAndInsert,
  },
  // 2026-05-22 — 연수구 39만 (인천광역시). ASP system (report.asp?seq=N), 29,084+ 보도자료.
  {
    key: "yeonsu",
    city: "연수구",
    ministry: "연수구청",
    siteUrl: "https://www.yeonsu.go.kr/main/community/notify/report.asp",
    fn: scrapeYeonsuAndInsert,
  },
  // 2026-05-22 — 인천 서구 56만. 부평구와 동일 system. 18,488+ 보도자료.
  {
    key: "seo_incheon",
    city: "인천 서구",
    ministry: "인천 서구청",
    siteUrl:
      "https://www.seo.incheon.kr/open_content/main/community/news/report.jsp",
    fn: scrapeSeoIncheonAndInsert,
  },
  // 2026-05-22 — 하남시 32만. SI 표준 selectBbsNttList.
  {
    key: "hanam",
    city: "하남시",
    ministry: "하남시청",
    siteUrl:
      "https://www.hanam.go.kr/sosik/selectBbsNttList.do?bbsNo=1164&key=10048",
    fn: scrapeHanamAndInsert,
  },
  // 2026-05-22 — 구리시 18만. SI 표준 selectBbsNttList.
  {
    key: "guri",
    city: "구리시",
    ministry: "구리시청",
    siteUrl:
      "https://guri.go.kr/www/selectBbsNttList.do?bbsNo=42&key=393",
    fn: scrapeGuriAndInsert,
  },
  // 2026-05-22 — 충주시 21만. SI 표준 + 30,226+ 보도자료.
  {
    key: "chungju",
    city: "충주시",
    ministry: "충주시청",
    siteUrl:
      "https://www.chungju.go.kr/www/selectBbsNttList.do?bbsNo=6&key=494",
    fn: scrapeChungjuAndInsert,
  },
  // 2026-05-22 — 여수시 27만 (사장님 거주지 전남 인접). 자체 CMS + 30,327+ 보도자료.
  {
    key: "yeosu",
    city: "여수시",
    ministry: "여수시청",
    siteUrl: "https://yeosu.go.kr/www/govt/news/release",
    fn: scrapeYeosuAndInsert,
  },
  // 2026-05-22 — 목포시 21만 (전남). 자체 CMS (idx=N&mode=view) + 10,764+ 보도자료.
  {
    key: "mokpo",
    city: "목포시",
    ministry: "목포시청",
    siteUrl: "https://www.mokpo.go.kr/www/mokpo_news/press_release",
    fn: scrapeMokpoAndInsert,
  },
  // 2026-05-22 — 광양시 14만 (전남). board.es CMS (mid=a11007000000&bid=0057) + 27,607+ 보도자료.
  {
    key: "gwangyang",
    city: "광양시",
    ministry: "광양시청",
    siteUrl: "https://gwangyang.go.kr/board.es?mid=a11007000000&bid=0057",
    fn: scrapeGwangyangAndInsert,
  },
  // 2026-05-29 — 부산진구는 Playwright 프록시 경로(local-press-proxy.yml)로 이관. dual-path 제거.
  // 2026-05-25 — 광주 남구 21만. board.es CMS (mid=a10707060200&bid=0001).
  {
    key: "namgu_gwangju",
    city: "광주 남구",
    ministry: "광주 남구청",
    siteUrl:
      "https://www.namgu.gwangju.kr/board.es?mid=a10707060200&bid=0001",
    fn: scrapeNamguGwangjuAndInsert,
  },
  // 2026-06-07 — 광주 북구 41만. eminwon 재이관(기존 board.es=희망아카데미 오등록 폐기).
  {
    key: "bukgu_gwangju",
    city: "광주 북구",
    ministry: "광주 북구청",
    siteUrl:
      "https://eminwon.bukgu.gwangju.kr/emwp/jsp/ofr/OfrNewsEpctLSub.jsp",
    fn: scrapeBukguGwangjuEminwonAndInsert,
  },
  // 2026-05-25 — 광주 서구 30만. board.es CMS (mid=c50501000000&bid=0154).
  {
    key: "seogu_gwangju",
    city: "광주 서구",
    ministry: "광주 서구청",
    siteUrl: "https://www.seogu.gwangju.kr/board.es?mid=c50501000000&bid=0154",
    fn: scrapeSeoguGwangjuAndInsert,
  },
  // 2026-05-25 — 광주 동구 9만. board.es CMS (mid=a10402010000, 북구와 동일).
  // 도메인 donggu.kr (subdomain 없음, 다른 광주 자치구와 차이).
  {
    key: "donggu_gwangju",
    city: "광주 동구",
    ministry: "광주 동구청",
    siteUrl: "https://www.donggu.kr/board.es?mid=a10402010000&bid=0001",
    fn: scrapeDongguGwangjuAndInsert,
  },
  // 2026-06-08 — 인천 남동구: prod 403 ASN 차단 → 정적 cron 0건. GHA+icn1 경로
  //   (scrapeNamdongIncheon, makeScraper :has 한정)로 이관. dual-path 방지로 정적 등록 제거.
  //   (namdong_incheon.ts·_pc_runner_cfgs 의 정적 parser 재사용은 유지)
  // 2026-05-26 — 인천 계양구 30만. open_content/bbsMsgDetail CMS (서구 동일 base path).
  {
    key: "gyeyang_incheon",
    city: "계양구",
    ministry: "계양구청",
    siteUrl: "https://www.gyeyang.go.kr/open_content/main/open_info/admin/report.jsp",
    fn: scrapeGyeyangIncheonAndInsert,
  },
  // 2026-05-26 — 인천 미추홀구 41만. board/view.do?sq=N&board_code=news_item CMS (단독).
  {
    key: "michuhol_incheon",
    city: "미추홀구",
    ministry: "미추홀구청",
    siteUrl: "https://www.michuhol.go.kr/main/board/list.do?board_code=news_item",
    fn: scrapeMichuholAndInsert,
  },
  // 2026-05-29 — 부산진·금정·동래는 Playwright 프록시 경로(local-press-proxy.yml)로 수집.
  // 2026-05-30 — 기장군 eminwon 별도 시스템 OfrAction.do POST 경로로 이관 완료.
  // 2026-06-01 — 부산 북구도 eminwon 으로 재이관(proxy 공동주택 오등록 폐기).
  // list/detail 모두 POST + form-urlencoded. chromium 불필요(fetch + regex 충분).
  // 정찰 결과는 메모리 project_headless_runner_2026_05_29 참조.
  {
    key: "gijang",
    city: "기장군",
    ministry: "기장군청",
    siteUrl: "https://eminwon.gijang.go.kr/emwp/jsp/ofr/OfrNewsEpctLSub.jsp",
    fn: scrapeGijangEminwonAndInsert,
  },
  {
    key: "bsbukgu",
    city: "부산 북구",
    ministry: "부산 북구청",
    siteUrl: "https://eminwon.bsbukgu.go.kr/emwp/jsp/ofr/OfrNewsEpctLSub.jsp",
    fn: scrapeBsbukguEminwonAndInsert,
  },
  {
    key: "yuseong",
    city: "대전 유성구",
    ministry: "대전 유성구청",
    siteUrl: "https://eminwon.yuseong.go.kr/emwp/jsp/ofr/OfrNewsEpctLSub.jsp",
    fn: scrapeYuseongEminwonAndInsert,
  },
  {
    key: "donggu_daejeon",
    city: "대전 동구",
    ministry: "대전 동구청",
    siteUrl: "https://donggu.go.kr/dg/kor/article/newsNSEW",
    fn: scrapeDongguDaejeonAndInsert,
  },
  {
    key: "junggu_daejeon",
    city: "대전 중구",
    ministry: "대전 중구청",
    siteUrl: "https://www.djjunggu.go.kr/prog/bbsArticle/BBSMSTR_000000000137/list.do?mno=sub03_07",
    fn: scrapeJungguDaejeonAndInsert,
  },
  {
    key: "daedeok",
    city: "대전 대덕구",
    ministry: "대전 대덕구청",
    siteUrl: "https://www.daedeok.go.kr/dpt/dpt04/DPT040301_cmmBoardList.do",
    fn: scrapeDaedeokAndInsert,
  },
  {
    key: "gongju",
    city: "충남 공주시",
    ministry: "충남 공주시청",
    siteUrl: "https://www.gongju.go.kr/prog/saeolNews/sub04_02_01/list.do",
    fn: scrapeGongjuAndInsert,
  },
  {
    key: "boryeong",
    city: "충남 보령시",
    ministry: "충남 보령시청",
    siteUrl: "https://www.brcn.go.kr/prog/eminwon/kor/AA/sub04_02/list.do",
    fn: scrapeBoryeongAndInsert,
  },
  {
    key: "asan",
    city: "충남 아산시",
    ministry: "충남 아산시청",
    siteUrl: "https://media.asan.go.kr/develop/m_news/?m_mode=list&cate=news",
    fn: scrapeAsanAndInsert,
  },
  {
    key: "nonsan",
    city: "충남 논산시",
    ministry: "충남 논산시청",
    siteUrl: "https://www.nonsan.go.kr/kor/html/sub03/030106.html",
    fn: scrapeNonsanAndInsert,
  },
  {
    key: "gyeryong",
    city: "충남 계룡시",
    ministry: "충남 계룡시청",
    siteUrl: "https://www.gyeryong.go.kr/kr/html/sub03/030105.html",
    fn: scrapeGyeryongAndInsert,
  },
  {
    key: "dangjin",
    city: "충남 당진시",
    ministry: "충남 당진시청",
    siteUrl: "https://www.dangjin.go.kr/cop/bbs/BBSMSTR_000000000014/selectBoardList.do",
    fn: scrapeDangjinAndInsert,
  },
  {
    key: "geumsan",
    city: "충남 금산군",
    ministry: "충남 금산군청",
    siteUrl: "https://www.geumsan.go.kr/media/html/sub01/0102.html",
    fn: scrapeGeumsanAndInsert,
  },
  {
    key: "buyeo",
    city: "충남 부여군",
    ministry: "충남 부여군청",
    siteUrl: "https://www.buyeo.go.kr/_prog/_board/?code=news_07&site_dvs_cd=kr&menu_dvs_cd=0408",
    fn: scrapeBuyeoAndInsert,
  },
  {
    key: "seocheon",
    city: "충남 서천군",
    ministry: "충남 서천군청",
    siteUrl: "https://www.seocheon.go.kr/bbs/BBSMSTR_000000000270/list.do",
    fn: scrapeSeocheonAndInsert,
  },
  {
    key: "cheongyang",
    city: "충남 청양군",
    ministry: "충남 청양군청",
    siteUrl: "https://www.cheongyang.go.kr/cop/bbs/BBSMSTR_000000000064/selectBoardList.do",
    fn: scrapeCheongyangAndInsert,
  },
  {
    key: "hongseong",
    city: "충남 홍성군",
    ministry: "충남 홍성군청",
    siteUrl: "https://www.hongseong.go.kr/bbs/BBSMSTR_000000000842/list.do",
    fn: scrapeHongseongAndInsert,
  },
  {
    key: "yesan",
    city: "충남 예산군",
    ministry: "충남 예산군청",
    siteUrl: "https://www.yesan.go.kr/bbs/BBSMSTR_000000000047/list.do",
    fn: scrapeYesanAndInsert,
  },
  {
    key: "taean",
    city: "충남 태안군",
    ministry: "충남 태안군청",
    siteUrl: "https://www.taean.go.kr/cop/bbs/BBSMSTR_000000000040/selectBoardList.do",
    fn: scrapeTaeanAndInsert,
  },
  {
    key: "jeongeup",
    city: "전북 정읍시",
    ministry: "전북 정읍시청",
    siteUrl:
      "https://www.jeongeup.go.kr/board/list.jeongeup?boardId=BBS_0000019&menuCd=DOM_000000101002001000",
    fn: scrapeJeongeupAndInsert,
  },
  {
    key: "namwon",
    city: "전북 남원시",
    ministry: "전북 남원시청",
    siteUrl:
      "https://www.namwon.go.kr/board/post/list.do?boardUid=ff8080818ea1fec5018ea24651660037&menuUid=ff8080818e3beff0018e407936b40088",
    fn: scrapeNamwonAndInsert,
  },
  {
    key: "gimje",
    city: "전북 김제시",
    ministry: "전북 김제시청",
    siteUrl:
      "https://www.gimje.go.kr/board/list.gimje?boardId=BBS_0000046&menuCd=DOM_000000104005000000",
    fn: scrapeGimjeAndInsert,
  },
  {
    key: "wanju",
    city: "전북 완주군",
    ministry: "전북 완주군청",
    siteUrl:
      "https://www.wanju.go.kr/news/planweb/board/list.9is?contentUid=ff808081898ba9ba0189f1e5b91101a9&boardUid=ff8080818b024d8e018b1c99655f1226",
    fn: scrapeWanjuAndInsert,
  },
  {
    key: "jinan",
    city: "전북 진안군",
    ministry: "전북 진안군청",
    siteUrl:
      "https://www.jinan.go.kr/board/list.jinan?menuCd=DOM_000000107002002000&boardId=BBS_0000034",
    fn: scrapeJinanAndInsert,
  },
  {
    key: "muju",
    city: "전북 무주군",
    ministry: "전북 무주군청",
    siteUrl:
      "https://www.muju.go.kr/planweb/board/list.9is?contentUid=ff8080816c5f9d47016cbd3baf240074&boardUid=ff8080816d3d662f016d4218d1360434",
    fn: scrapeMujuAndInsert,
  },
  {
    key: "jangsu",
    city: "전북 장수군",
    ministry: "전북 장수군청",
    siteUrl:
      "https://www.jangsu.go.kr/board/list.jangsu?boardId=BBS_0000041&menuCd=DOM_000000102001012000&orderBy=REGISTER_DATE%20DESC&paging=ok&startPage=1",
    fn: scrapeJangsuAndInsert,
  },
  {
    key: "sunchang",
    city: "전북 순창군",
    ministry: "전북 순창군청",
    siteUrl:
      "https://www.sunchang.go.kr/board/post/list.do?boardUid=ff8080819a2f0e3b019a71a46284217a&menuUid=ff8080819a2f0e3b019a5d1bb7da1652",
    fn: scrapeSunchangAndInsert,
  },
  {
    key: "buan",
    city: "전북 부안군",
    ministry: "전북 부안군청",
    siteUrl:
      "https://www.buan.go.kr/board/list.buan?boardId=BBS_0000059&menuCd=DOM_000000103002001000&contentsSid=90&cpath=",
    fn: scrapeBuanAndInsert,
  },
  {
    key: "gochang",
    city: "전북 고창군",
    ministry: "전북 고창군청",
    siteUrl:
      "https://www.gochang.go.kr/board/list.gochang?boardId=BBS_0000179&menuCd=DOM_000000102002001000",
    fn: scrapeGochangAndInsert,
  },
  {
    key: "naju",
    city: "전남 나주시",
    ministry: "전남 나주시청",
    siteUrl: "https://www.naju.go.kr/www/administration/reporting/coverage",
    fn: scrapeNajuAndInsert,
  },
  {
    key: "damyang",
    city: "전남 담양군",
    ministry: "전남 담양군청",
    siteUrl:
      "https://www.damyang.go.kr/board/list?domainId=DOM_0000001&boardId=BBS_0000007&contentsSid=12&menuCd=DOM_000000190001005001",
    fn: scrapeDamyangAndInsert,
  },
  {
    key: "gurye",
    city: "전남 구례군",
    ministry: "전남 구례군청",
    siteUrl:
      "https://www.gurye.go.kr/board/list.do?bbsId=BBS_0000000000000300&menuNo=115004006000",
    fn: scrapeGuryeAndInsert,
  },
  {
    key: "gokseong",
    city: "전남 곡성군",
    ministry: "전남 곡성군청",
    siteUrl:
      "https://www.gokseong.go.kr/kr/board/list.do?bbsId=BBS_000000000000151&menuNo=102001002000",
    fn: scrapeGokseongAndInsert,
  },
  {
    key: "goheung",
    city: "전남 고흥군",
    ministry: "전남 고흥군청",
    siteUrl: "https://www.goheung.go.kr/boardList.do?pageId=www102&boardId=BD_00025",
    fn: scrapeGoheungAndInsert,
  },
  {
    key: "boseong",
    city: "전남 보성군",
    ministry: "전남 보성군청",
    siteUrl: "https://www.boseong.go.kr/www/open_administration/city_news/press_release",
    fn: scrapeBoseongAndInsert,
  },
  {
    key: "hwasun",
    city: "전남 화순군",
    ministry: "전남 화순군청",
    siteUrl: "https://www.hwasun.go.kr/gallery.do?S=S01&M=020101000000&b_code=0000000001",
    fn: scrapeHwasunAndInsert,
  },
  {
    key: "gangjin",
    city: "전남 강진군",
    ministry: "전남 강진군청",
    siteUrl: "https://www.gangjin.go.kr/www/government/news/press",
    fn: scrapeGangjinAndInsert,
  },
  {
    key: "jangheung",
    city: "전남 장흥군",
    ministry: "전남 장흥군청",
    siteUrl: "https://www.jangheung.go.kr/www/organization/news/jh_news",
    fn: scrapeJangheungAndInsert,
  },
  {
    key: "yeongam",
    city: "전남 영암군",
    ministry: "전남 영암군청",
    siteUrl: "https://www.yeongam.go.kr/home/www/open_information/yeongam_news/bodo/yeongam.go",
    fn: scrapeYeongamAndInsert,
  },
  {
    key: "muan",
    city: "전남 무안군",
    ministry: "전남 무안군청",
    siteUrl: "https://www.muan.go.kr/www/openmuan/new/report",
    fn: scrapeMuanAndInsert,
  },
  {
    key: "yeonggwang",
    city: "전남 영광군",
    ministry: "전남 영광군청",
    siteUrl: "https://www.yeonggwang.go.kr/bbs/?b_id=news_data&site=headquarter_new&mn=9056",
    fn: scrapeYeonggwangAndInsert,
  },
  {
    key: "seosan",
    city: "충남 서산시",
    ministry: "충남 서산시청",
    siteUrl: "https://www.seosan.go.kr/www/selectBbsNttList.do?bbsNo=101&key=1260",
    fn: scrapeSeosanAndInsert,
  },
  {
    key: "gangneung",
    city: "강원 강릉시",
    ministry: "강원 강릉시청",
    siteUrl: "https://www.gn.go.kr/www/selectBbsNttList.do?bbsNo=23&key=277",
    fn: scrapeGangneungAndInsert,
  },
  {
    key: "taebaek",
    city: "강원 태백시",
    ministry: "강원 태백시청",
    siteUrl: "https://www.taebaek.go.kr/www/selectBbsNttList.do?bbsNo=31&key=359",
    fn: scrapeTaebaekAndInsert,
  },
  {
    key: "samcheok",
    city: "강원 삼척시",
    ministry: "강원 삼척시청",
    siteUrl: "https://www.samcheok.go.kr/media/00084/00094.web?gcode=1006",
    fn: scrapeSamcheokAndInsert,
  },
  {
    key: "chuncheon",
    city: "강원 춘천시",
    ministry: "강원 춘천시청",
    siteUrl: "https://www.chuncheon.go.kr/mayor/newsroom/press-release/",
    fn: scrapeChuncheonAndInsert,
  },
  {
    key: "hongcheon",
    city: "강원 홍천군",
    ministry: "강원 홍천군청",
    siteUrl: "https://www.hongcheon.go.kr/www/selectEminwonNewsList.do?key=283&ofr_pageSize=10",
    fn: scrapeHongcheonAndInsert,
  },
  {
    key: "cheorwon",
    city: "강원 철원군",
    ministry: "강원 철원군청",
    siteUrl: "https://www.cwg.go.kr/www/selectBbsNttList.do?bbsNo=32&key=218",
    fn: scrapeCheorwonAndInsert,
  },
  {
    key: "donghae",
    city: "강원 동해시",
    ministry: "강원 동해시청",
    siteUrl: "https://www.dh.go.kr/www/selectBbsNttList.do?bbsNo=95&key=489",
    fn: scrapeDonghaeAndInsert,
  },
  {
    key: "jecheon",
    city: "충북 제천시",
    ministry: "충북 제천시청",
    siteUrl: "https://www.jecheon.go.kr/www/selectBbsNttList.do?key=112&bbsNo=287",
    fn: scrapeJecheonAndInsert,
  },
  {
    key: "okcheon",
    city: "충북 옥천군",
    ministry: "충북 옥천군청",
    siteUrl: "https://oc.go.kr/www/selectBbsNttList.do?key=252&bbsNo=44",
    fn: scrapeOkcheonAndInsert,
  },
  {
    key: "boeun",
    city: "충북 보은군",
    ministry: "충북 보은군청",
    siteUrl: "https://www.boeun.go.kr/www/selectBbsNttList.do?bbsNo=209&key=138",
    fn: scrapeBoeunAndInsert,
  },
  {
    key: "goesan",
    city: "충북 괴산군",
    ministry: "충북 괴산군청",
    siteUrl: "https://www.goesan.go.kr/www/selectBbsNttList.do?bbsNo=213&key=136",
    fn: scrapeGoesanAndInsert,
  },
  {
    key: "danyang",
    city: "충북 단양군",
    ministry: "충북 단양군청",
    siteUrl: "https://www.danyang.go.kr/dy21/984",
    fn: scrapeDanyangAndInsert,
  },
  {
    key: "eumseong",
    city: "충북 음성군",
    ministry: "충북 음성군청",
    siteUrl: "https://www.eumseong.go.kr/www/selectBbsNttList.do?bbsNo=27&key=353",
    fn: scrapeEumseongAndInsert,
  },
  {
    key: "jincheon",
    city: "충북 진천군",
    ministry: "충북 진천군청",
    siteUrl: "https://www.jincheon.go.kr/home/sub.do?menukey=247&mode=list",
    fn: scrapeJincheonAndInsert,
  },
  {
    key: "yeongdong",
    city: "충북 영동군",
    ministry: "충북 영동군청",
    siteUrl: "https://www.yd21.go.kr/kr/html/sub02/02010601.html",
    fn: scrapeYeongdongAndInsert,
  },
  {
    key: "jeungpyeong",
    city: "충북 증평군",
    ministry: "충북 증평군청",
    siteUrl: "https://www.jp.go.kr/kor/cop/bbs/BBSMSTR_000000000135/selectBoardList.do",
    fn: scrapeJeungpyeongAndInsert,
  },
  // 2026-05-27 — 인천 옹진군 2만. 인천 자치구 동일 bbsMsgDetail CMS (부평·연수·서·남동·계양 동일).
  // 2026-06-07 — 사이트 개편으로 siteUrl 신규 보도/해명 게시판 경로로 정정(구 경로는 302 redirect).
  {
    key: "ongjin",
    city: "옹진군",
    ministry: "옹진군청",
    siteUrl:
      "https://www.ongjin.go.kr/open_content/main/community/board/report.jsp",
    fn: scrapeOngjinAndInsert,
  },
  // 2026-07-22 disabled: 인천 중구 krop0231c public pages still exist, but
  // Vercel/static fetch receives a small /index.html shell (fetched=0, errors=[]).
  // Do not count it as a static cron stale target until a PC/Playwright path is wired.
  // {
  //   key: "junggu_incheon",
  //   city: "인천 중구",
  //   ministry: "인천 중구청",
  //   siteUrl: "https://www.icjg.go.kr/krop0231c",
  //   fn: scrapeJungguIncheonAndInsert,
  // },
  // 2026-05-28 인천 강화군 7만. bbsMsgDetail CMS, open_content/main/bbs 경로 사용.
  {
    key: "ganghwa",
    city: "강화군",
    ministry: "강화군청",
    siteUrl: "https://www.ganghwa.go.kr/open_content/main/bbs/bbsMsgList.do?bcd=report",
    fn: scrapeGanghwaAndInsert,
  },
  // 2026-05-28 인천 동구 6만. bbsMsgDetail CMS, bcd=press 게시판 사용.
  {
    key: "donggu_incheon",
    city: "인천 동구",
    ministry: "인천 동구청",
    siteUrl: "https://www.icdonggu.go.kr/main/bbs/bbsMsgList.do?bcd=press",
    fn: scrapeDongguIncheonAndInsert,
  },
  // 2026-05-24 — 의정부시 45만 (경기). egov portal/bbs (mId=0301020000&ptIdx=1709) + 16,320+ 보도자료.
  // disabled 2026-05-24: node fetch 차단으로 정적 검증 0. Chrome MCP 으로 실 응답 확인 후 다음 batch 에 인구 순 위치로 재등록.
  // {
  //   key: "uijeongbu",
  //   city: "의정부시",
  //   ministry: "의정부시청",
  //   siteUrl:
  //     "https://www.ui4u.go.kr/portal/bbs/list.do?mId=0301020000&ptIdx=1709",
  //   fn: scrapeUijeongbuAndInsert,
  // },
  // 2026-05-31 서울 18 자치구 확장 (5/30 정찰 base 활용)
  // 패턴 1: eGovFrame portal/bbs (광진·동작·용산) — dbData 본문 + span.date.
  {
    key: "gwangjin",
    city: "광진구",
    ministry: "광진구청",
    siteUrl: "https://www.gwangjin.go.kr/portal/bbs/B0000002/list.do?menuNo=200191",
    fn: scrapeGwangjinAndInsert,
  },
  {
    key: "dongjak",
    city: "동작구",
    ministry: "동작구청",
    siteUrl: "https://www.dongjak.go.kr/portal/bbs/B0000171/list.do?menuNo=200647",
    fn: scrapeDongjakAndInsert,
  },
  {
    key: "yongsan",
    city: "용산구",
    ministry: "용산구청",
    siteUrl: "https://www.yongsan.go.kr/portal/bbs/B0000043/list.do?menuNo=200230",
    fn: scrapeYongsanAndInsert,
  },
  // 패턴 3: /site/main/board/press (마포) — bbs_view_body 본문 + td YYYY.MM.DD.
  {
    key: "mapo",
    city: "마포구",
    ministry: "마포구청",
    siteUrl: "https://www.mapo.go.kr/site/main/board/press/list",
    fn: scrapeMapoAndInsert,
  },
  // 패턴 4: ASP 클래식 (도봉) — bbs.asp?bmode=D&pcode=N + bbsCont 본문.
  // list 의 광고 banner Contents.asp anchor 와 보도자료 bbs.asp anchor 가 명확 구분.
  {
    key: "dobong",
    city: "도봉구",
    ministry: "도봉구청",
    siteUrl: "https://www.dobong.go.kr/Contents.asp?code=10008782",
    fn: scrapeDobongAndInsert,
  },
  // 패턴 5: eGovFrame site/ex/bbs JS onclick (관악·양천)
  // — href="#view" + doBbsFView() onclick → bcIdx 추출 → View.do?cbIdx=N&bcIdx=N
  {
    key: "gwanak",
    city: "관악구",
    ministry: "관악구청",
    siteUrl: "https://www.gwanak.go.kr/site/gwanak/ex/bbs/List.do?cbIdx=295",
    fn: scrapeGwanakAndInsert,
  },
  // 2026-06-08 — 양천구: ASN 차단 site 라 Vercel cron 0건(정적 parse 는 정상). GHA+icn1
  //   경로(scrapeYangcheon)로 이관. dual-path 방지로 정적 등록 제거. yangcheon.ts·테스트 유지.
  // 2026-06-01 — 서울 자치구 확장 (SI 표준 selectBbsNttList, 송파·군포 동일 CMS).
  // 2026-06-08 — 성동구: 본문 전문이 hwp 첨부에만(ASN 차단) → 정적 cron 0건. GHA+icn1
  //   경로(scrapeSeongdong, _si_attach.mjs hwp 파싱)로 이관. dual-path 방지로 정적 등록 제거.
  //   (seongdong.ts·테스트 유지 — 정적 parse 회귀 방어)
  {
    key: "yeongdeungpo",
    city: "영등포구",
    ministry: "영등포구청",
    siteUrl: "https://www.ydp.go.kr/www/selectBbsNttList.do?bbsNo=45&key=2868",
    fn: scrapeYeongdeungpoAndInsert,
  },
  // 2026-06-08 — 은평구: 본문 .p-table__content JS 렌더 → 정적 cron 0건. GHA+icn1
  //   경로(scrapeEunpyeong)로 이관. dual-path 방지로 정적 등록 제거. (eunpyeong.ts·테스트 유지)
  // 2026-06-01 — 서대문구 구정뉴스. ⚠️ EUC-KR 사이트(factory encoding opt-in).
  // 보도자료 메뉴는 구보(PDF)라 부적합 → /news/news.do 개별 기사 board 사용.
  {
    key: "seodaemun",
    city: "서대문구",
    ministry: "서대문구청",
    siteUrl: "https://www.sdm.go.kr/news/news.do",
    fn: scrapeSeodaemunAndInsert,
  },
  // 2026-06-01 — 금천구 보도자료. SI 표준 bbsNo=8 (메인 메뉴의 150151 은 영상 갤러리).
  {
    key: "geumcheon",
    city: "금천구",
    ministry: "금천구청",
    siteUrl: "https://www.geumcheon.go.kr/portal/selectBbsNttList.do?bbsNo=8&key=297",
    fn: scrapeGeumcheonAndInsert,
  },
  // 2026-06-01 — 강서구 보도자료. eDotXpress CMS (/gs040201/{id} 정적, view-content 본문).
  {
    key: "gangseo",
    city: "강서구",
    ministry: "강서구청",
    ministryAliases: ["서울특별시 강서구", "서울 강서구"],
    siteUrl: "https://www.gangseo.seoul.kr/gs040201",
    fn: scrapeGangseoAndInsert,
  },
  // 2026-06-01 — 종로구 보도자료. eGovFrame selectBoardList (bbsId=1618, viewMove nttId).
  {
    key: "jongno",
    city: "종로구",
    ministry: "종로구청",
    siteUrl:
      "https://www.jongno.go.kr/portal/bbs/selectBoardList.do?bbsId=BBSMSTR_000000001618&menuId=388338&menuNo=388338",
    fn: scrapeJongnoAndInsert,
  },
  // 2026-06-01 — 구로구 보도자료. SI 표준 bbsNo=665 (메인 빈 shell → /www/index.do).
  {
    key: "guro",
    city: "구로구",
    ministry: "구로구청",
    siteUrl: "https://www.guro.go.kr/www/selectBbsNttList.do?bbsNo=665&key=1793",
    fn: scrapeGuroAndInsert,
  },
  // 2026-06-08 — 동대문구: SI 첨부 본문(hwp/pdf) + ASN 차단 → 정적 cron 0건. GHA+icn1
  //   경로(scrapeDongdaemun, makeSiAttachScraper)로 이관. dual-path 방지로 정적 등록 제거.
  // 2026-06-01 — 서초구 보도자료. eGovFrame site/ex/bbs (cbIdx=61, view_contents 본문).
  {
    key: "seocho",
    city: "서초구",
    ministry: "서초구청",
    siteUrl: "https://www.seocho.go.kr/site/seocho/ex/bbs/List.do?cbIdx=61",
    fn: scrapeSeochoAndInsert,
  },
  // 2026-06-01 — 서울 중구 보도자료. 자체 content.do CMS (cmsid=14390). 인천 중구와 별개.
  {
    key: "junggu_seoul",
    city: "서울 중구",
    ministry: "서울 중구청",
    siteUrl: "https://www.junggu.seoul.kr/content.do?cmsid=14390",
    fn: scrapeJungguSeoulAndInsert,
  },
  // 2026-06-08 — 성북구: SI 첨부 본문(hwp/pdf) + ASN 차단 → 정적 cron 0건. GHA+icn1
  //   경로(scrapeSeongbuk, makeSiAttachScraper)로 이관. dual-path 방지로 정적 등록 제거.
  // 2026-06-01 — 강동구 보도자료. newportal CMS (/web/newportal/press/{id} 정적,
  // input-table colspan=4 본문). 메인이 meta refresh 로 /newportal/ 이동.
  {
    key: "gangdong",
    city: "강동구",
    ministry: "강동구청",
    siteUrl: "https://www.gangdong.go.kr/web/newportal/press/list",
    fn: scrapeGangdongAndInsert,
  },
  // 2026-06-01 — 대전 서구 보도자료 (48만, 대전 최대 자치구). eGovFrame bbs.
  // 광주 서구·인천 서구와 별개 (key=seogu_daejeon).
  {
    key: "seogu_daejeon",
    city: "대전 서구",
    ministry: "대전 서구청",
    siteUrl: "https://www.seogu.go.kr/bbs/BBSMSTR_000000000277/list.do",
    fn: scrapeSeoguDaejeonAndInsert,
  },
];

// key → entry lookup (actions.ts 가 city key 로 검색)
export const CITY_BY_KEY = CITY_REGISTRY.reduce(
  (acc, entry) => {
    acc[entry.key] = entry;
    return acc;
  },
  {} as Record<CityKey, CityEntry>,
);
