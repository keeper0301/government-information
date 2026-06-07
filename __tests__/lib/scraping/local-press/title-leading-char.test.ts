// 제목 시작 [가-힣] 강제 버그 회귀 방어 (2026-06-07).
// 보도자료 제목이 따옴표(‘)·㈜·영문·숫자로 시작하면 누락되던 버그를 6개 collector에서
// 수정했다. 각 collector parseListPage 가 비한글 시작 제목을 매치하고, 한글 없는 junk 는
// 차단하는지 검증해 동일 버그의 silent 재발을 막는다.
//
// 검증된 실제 누락 사례(2026-06-07): 세종 4건/40%·전주 2건·청주 1건·포항 4건.

import { describe, it, expect } from "vitest";
import { parseListPage as parsePohang } from "@/lib/scraping/local-press/pohang";
import { parseListPage as parsePyeongtaek } from "@/lib/scraping/local-press/pyeongtaek";
import { parseListPage as parseCheongju } from "@/lib/scraping/local-press/cheongju";
import { parseListPage as parseSejong } from "@/lib/scraping/local-press/sejong";
import { parseListPage as parseJeonju } from "@/lib/scraping/local-press/jeonju";
import { parseListPage as parseYongin } from "@/lib/scraping/local-press/yongin";

// SI 표준(포항·평택): data-req-get-p-idx + span(tit/list_title) + span(date/list_data)
const pohangHtml = `
<a data-req-get-p-idx="1001"><span class="tit">‘따옴표로 시작하는 보도자료 제목</span><span class="date">2026-06-07(금)</span></a>
<a data-req-get-p-idx="1002"><span class="tit">포항시, 한글로 시작하는 보도자료</span><span class="date">2026-06-07(금)</span></a>
<a data-req-get-p-idx="1003"><span class="tit">English menu label only</span><span class="date">2026-06-07(금)</span></a>`;
const pyeongtaekHtml = `
<a data-req-get-p-idx="2001"><span class="list_title">‘따옴표로 시작하는 보도자료 제목</span><span class="list_data">작성일 2026.06.07 조회 5</span></a>
<a data-req-get-p-idx="2002"><span class="list_title">평택시, 한글로 시작하는 보도자료</span><span class="list_data">작성일 2026.06.07 조회 5</span></a>`;

// a href + 별도 날짜 td (청주·세종·전주)
const cheongjuHtml = `
<a href="./selectBbsNttView.do?bbsNo=40&nttNo=3001">‘따옴표로 시작하는 보도자료 제목</a><td>2026.06.07</td>
<a href="./selectBbsNttView.do?bbsNo=40&nttNo=3002">청주시, 한글로 시작하는 보도자료</a><td>2026.06.07</td>`;
const sejongHtml = `
<a href="/bbs/R0079/view.do?nttId=ABC100">‘따옴표로 시작하는 보도자료 제목</a><td data-cell-header="등록일">2026-06-07</td>
<a href="/bbs/R0079/view.do?nttId=ABC101">세종시, 한글로 시작하는 보도자료</a><td data-cell-header="등록일">2026-06-07</td>`;
const jeonjuHtml = `
<a href="/planweb/board/view.9is?dataUid=0123456789abcdef0123456789abcdef">㈜기업명으로 시작하는 보도자료 제목</a><td class="date">2026-06-07</td>
<a href="/planweb/board/view.9is?dataUid=fedcba9876543210fedcba9876543210">전주시, 한글로 시작하는 보도자료</a><td class="date">2026-06-07</td>`;
// 용인: seq 14자리+, 앞 8자리 날짜
const yonginHtml = `
<a href="BD_selectBbs.do?q_bbsCode=1020&q_bbscttSn=20260607000001">‘따옴표로 시작하는 보도자료 제목</a>
<a href="BD_selectBbs.do?q_bbsCode=1020&amp;q_bbscttSn=20260607000002">용인시, 한글로 시작하는 보도자료</a>`;

const cases: Array<[string, (h: string) => { title: string }[], string]> = [
  ["포항", parsePohang, pohangHtml],
  ["평택", parsePyeongtaek, pyeongtaekHtml],
  ["청주", parseCheongju, cheongjuHtml],
  ["세종", parseSejong, sejongHtml],
  ["전주", parseJeonju, jeonjuHtml],
  ["용인", parseYongin, yonginHtml],
];

describe("제목 시작 [가-힣] 강제 버그 회귀 방어", () => {
  for (const [city, parse, html] of cases) {
    it(`${city} — 비한글(따옴표·㈜) 시작 제목 + 한글 시작 제목 모두 매치`, () => {
      const items = parse(html);
      const titles = items.map((i) => i.title);
      // 비한글 시작 제목이 누락되지 않아야 한다(이게 버그였음)
      const nonKorean = titles.find((t) => /^[‘㈜]/.test(t));
      expect(nonKorean, `${city}: 비한글 시작 제목 누락`).toBeTruthy();
      // 한글 시작 제목도 함께 잡혀야 한다
      expect(titles.some((t) => /^[가-힣]/.test(t))).toBe(true);
      expect(items.length).toBe(2);
    });
  }

  it("포항 — 한글 없는 영문 junk 는 차단", () => {
    const items = parsePohang(pohangHtml);
    expect(items.some((i) => i.title === "English menu label only")).toBe(false);
  });
});
