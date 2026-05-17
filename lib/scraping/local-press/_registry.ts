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
  | "sejong";

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
];

// key → entry lookup (actions.ts 가 city key 로 검색)
export const CITY_BY_KEY = CITY_REGISTRY.reduce(
  (acc, entry) => {
    acc[entry.key] = entry;
    return acc;
  },
  {} as Record<CityKey, CityEntry>,
);
