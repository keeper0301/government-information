// ============================================================
// PC runner cfg map (2026-05-25)
// ============================================================
// ASN 차단 site (서울·부산·광산·강원·제주·평택) 의 collector cfg.
// PC runner POST upload endpoint 가 사용.
//
// seoul 은 별도 type (SeoulNewsItem seq: number) — 다음 commit 에 wrapper.
// 5 site 우선.
// ============================================================

import type { PressCollectorConfig } from "./_factory";

// 2026-05-26: seoul 은 news.seoul.go.kr RSS 으로 변경 — Vercel cron 정적 fetch 가능.
// PC runner cfg 에서 제거 (일반 cron 가동).

import {
  parseListPage as parseBusanList,
  parseDetailBody as parseBusanDetail,
} from "./busan";
import {
  parseListPage as parseGwangsanList,
  parseDetailBody as parseGwangsanDetail,
} from "./gwangsan";
// 2026-05-26: gangwon 제거 — icn1 region 으로 일반 cron 가동 OK (5/26 수동 트리거 inserted 10).

import {
  parseListPage as parseJejuList,
  parseDetailBody as parseJejuDetail,
} from "./jeju";
import {
  parseListPage as parsePyeongtaekList,
  parseDetailBody as parsePyeongtaekDetail,
} from "./pyeongtaek";

export const PC_RUNNER_CFGS: Record<string, PressCollectorConfig> = {
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
  // gangwon 제거 (2026-05-26): icn1 region 으로 일반 cron OK.
  jeju: {
    cityName: "제주특별자치도",
    region: "제주",
    ministry: "제주특별자치도청",
    sourceOutlet: "제주특별자치도청",
    sourceCode: "local-press-jeju",
    listUrl: "https://www.jeju.go.kr/news/bodo/list.htm",
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
