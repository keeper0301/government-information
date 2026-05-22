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
import { scrapeSuwonAndInsert } from "./suwon";
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
import { scrapePyeongtaekAndInsert } from "./pyeongtaek";
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
import { scrapeJejuAndInsert } from "./jeju";
import { scrapeGangnamAndInsert } from "./gangnam";
import { scrapeNowonAndInsert } from "./nowon";
import { scrapeSongpaAndInsert } from "./songpa";
import { scrapeAnyangAndInsert } from "./anyang";
import { scrapeUiwangAndInsert } from "./uiwang";
import { scrapeGimpoAndInsert } from "./gimpo";
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

export type CityKey =
  | "suncheon"
  | "gwangju"
  | "seoul"
  | "suwon"
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
  | "pyeongtaek"
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
  | "jeju"
  | "gangnam"
  | "nowon"
  | "songpa"
  | "anyang"
  | "uiwang"
  | "gimpo"
  | "wonju"
  | "gwangsan"
  | "gunpo"
  | "yangju"
  | "bupyeong"
  | "yeonsu"
  | "seo_incheon"
  | "hanam"
  | "guri"
  | "chungju";

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
    key: "suwon",
    city: "수원시",
    ministry: "수원특례시청",
    siteUrl:
      "https://www.suwon.go.kr/web/news/notice/notice01.jsp?menuCd=1043",
    fn: scrapeSuwonAndInsert,
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
      "https://www.daejeon.go.kr/drh/board/boardList.do?boardId=PUBNTA01&menuSeq=2843",
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
  {
    key: "pyeongtaek",
    city: "평택시",
    ministry: "평택시청",
    siteUrl:
      "https://www.pyeongtaek.go.kr/pyeongtaek/board/post/list.do?bcIdx=90",
    fn: scrapePyeongtaekAndInsert,
  },
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
      "https://www.gb.go.kr/Main/page.do?mnu_uid=6792&LARGE_CODE=720&MEDIUM_CODE=50&SMALL_CODE=10&SMALL_CODE2=60",
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
  {
    key: "jeju",
    city: "제주특별자치도",
    ministry: "제주특별자치도청",
    ministryAliases: ["제주특별자치도", "제주도"],
    siteUrl: "https://www.jeju.go.kr/news/bodo/list.htm",
    fn: scrapeJejuAndInsert,
  },
  // 2026-05-22 — 광역시 자치구 확장 첫 시범 (강남구). 정적 fetch 가능 site.
  {
    key: "gangnam",
    city: "강남구",
    ministry: "강남구청",
    siteUrl:
      "https://www.gangnam.go.kr/board/B_000031/list.do?mid=ID01_031",
    fn: scrapeGangnamAndInsert,
  },
  // 2026-05-22 — 노원구. 화성·수원 와 같은 SI 표준 (BD_select), 5,563+ 보도자료.
  {
    key: "nowon",
    city: "노원구",
    ministry: "노원구청",
    siteUrl:
      "https://www.nowon.kr/www/user/bbs/BD_selectBbsList.do?q_bbsCode=1027",
    fn: scrapeNowonAndInsert,
  },
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
  // 2026-05-22 — 김포시 48만. SI 표준 + 17,781+ 보도자료 (매우 풍부).
  {
    key: "gimpo",
    city: "김포시",
    ministry: "김포시청",
    siteUrl:
      "https://www.gimpo.go.kr/news/selectBbsNttList.do?bbsNo=466&key=9377",
    fn: scrapeGimpoAndInsert,
  },
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
];

// key → entry lookup (actions.ts 가 city key 로 검색)
export const CITY_BY_KEY = CITY_REGISTRY.reduce(
  (acc, entry) => {
    acc[entry.key] = entry;
    return acc;
  },
  {} as Record<CityKey, CityEntry>,
);
