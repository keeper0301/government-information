// ============================================================
// PC runner cfg map (2026-05-25)
// ============================================================
// ASN 차단 site (서울·부산·광산·강원·제주·평택) 의 collector cfg.
// PC runner POST upload endpoint 가 사용.
//
// seoul 은 별도 type (SeoulNewsItem seq: number) — 다음 commit 에 wrapper.
// 5 site 우선.
// ============================================================

import type { PressCollectorConfig, PressNewsItem } from "./_factory";

import {
  parseListPage as parseSeoulListNum,
  parseDetailBody as parseSeoulDetail,
} from "./seoul";

// seoul wrapper — SeoulNewsItem seq:number → PressNewsItem seq:string 호환.
// body 필드 (SeoulNewsItem 만 가진) 는 PressNewsItem 에 없으므로 무시.
function parseSeoulList(html: string): PressNewsItem[] {
  return parseSeoulListNum(html).map((item) => ({
    seq: String(item.seq),
    title: item.title,
    publishedDate: item.publishedDate,
    sourceUrl: item.sourceUrl,
  }));
}

import {
  parseListPage as parseBusanList,
  parseDetailBody as parseBusanDetail,
} from "./busan";
import {
  parseListPage as parseGwangsanList,
  parseDetailBody as parseGwangsanDetail,
} from "./gwangsan";
import {
  parseListPage as parseGangwonList,
  parseDetailBody as parseGangwonDetail,
} from "./gangwon";
import {
  parseListPage as parseJejuList,
  parseDetailBody as parseJejuDetail,
} from "./jeju";
import {
  parseListPage as parsePyeongtaekList,
  parseDetailBody as parsePyeongtaekDetail,
} from "./pyeongtaek";

export const PC_RUNNER_CFGS: Record<string, PressCollectorConfig> = {
  seoul: {
    cityName: "서울특별시",
    region: "서울",
    ministry: "서울특별시청",
    sourceOutlet: "서울특별시청",
    sourceCode: "local-press-seoul",
    listUrl: "https://opengov.seoul.go.kr/press/list",
    parseListItems: parseSeoulList,
    parseDetailBody: parseSeoulDetail,
  },
  busan: {
    cityName: "부산광역시",
    region: "부산",
    ministry: "부산광역시청",
    sourceOutlet: "부산광역시청",
    sourceCode: "local-press-busan",
    listUrl: "https://www.busan.go.kr/nbtnewsBU",
    parseListItems: parseBusanList,
    parseDetailBody: parseBusanDetail,
  },
  gwangsan: {
    cityName: "광산구",
    region: "광주",
    ministry: "광산구청",
    sourceOutlet: "광산구청",
    sourceCode: "local-press-gwangsan",
    listUrl:
      "https://www.gwangsan.go.kr/boardList.do?boardId=REPORT_NEW&pageId=www16",
    parseListItems: parseGwangsanList,
    parseDetailBody: parseGwangsanDetail,
  },
  gangwon: {
    cityName: "강원특별자치도",
    region: "강원",
    ministry: "강원특별자치도청",
    sourceOutlet: "강원특별자치도청",
    sourceCode: "local-press-gangwon",
    listUrl: "https://state.gwd.go.kr/portal/briefing/pressRelease",
    parseListItems: parseGangwonList,
    parseDetailBody: parseGangwonDetail,
  },
  jeju: {
    cityName: "제주특별자치도",
    region: "제주",
    ministry: "제주특별자치도청",
    sourceOutlet: "제주특별자치도청",
    sourceCode: "local-press-jeju",
    listUrl: "https://www.jeju.go.kr/news/news/notice.htm",
    parseListItems: parseJejuList,
    parseDetailBody: parseJejuDetail,
  },
  pyeongtaek: {
    cityName: "평택시",
    region: "경기",
    ministry: "평택시청",
    sourceOutlet: "평택시청",
    sourceCode: "local-press-pyeongtaek",
    listUrl:
      "https://www.pyeongtaek.go.kr/pyeongtaek/board/post/list.do?bcIdx=90&mid=0402010000",
    parseListItems: parsePyeongtaekList,
    parseDetailBody: parsePyeongtaekDetail,
  },
};

export const PC_RUNNER_CITY_KEYS = Object.keys(PC_RUNNER_CFGS);
