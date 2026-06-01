// ============================================================
// 경상북도 parseListPage + parseDetailBody 단위 테스트
// ============================================================
// 2026-06-02 복구 — 본문 cont_view div-depth + 주석 선제거.
// 회귀 핵심: 제목이 HTML 주석 `<!--div ...>제목</div-->` 으로 감싸져 있어
// 주석 닫는 `</div-->` 가 div 깊이 추적을 오염(제목에서 조기종료)시키는 함정 방어.

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/gyeongbuk";

// 실제 사이트 구조 재현: 주석 제목 + 부제목 + 이미지(중첩 div) + 본문, 그 밖 네비.
const BODY_TEXT =
  "경상북도농업기술원은 5월 29일과 6월 5일 총 2회에 걸쳐 방과후 프로그램 강사로 활동할 " +
  "전문인력을 양성하기 위해 초등학교 방과후 프로그램 강사연수 교육을 추진한다. 이번 교육은 " +
  "방과후 프로그램 수요 확대에 발맞춰 농촌교육농장주들이 경쟁력을 갖추고 강사로 활동하도록 " +
  "기반을 마련하기 위해 실시됐다. 고대환 농업테크노파크과장은 학교에는 양질의 프로그램을 " +
  "제공해 만족도를 높이고 학생들에게는 농업·농촌의 가치를 알릴 수 있도록 적극 지원하겠다라고 밝혔다.";

function detailHtml(body: string): string {
  return `<html><body>
    <div class="reportview_cont">
      <div class="cont_view">
        <!--div class="view_title"> 농촌교육농장주, 교사로 변신! </div-->
        <div class="view_titlesub"> - 전문 인력 양성 -<br/>- 만족도 높아 - </div>
        <div class="reportview_img"><img src="/a.jpg" alt="단체컷"/><p class="explain"> </p></div>
        ${body}
      </div>
    </div>
    <!-- 이전글다음글 -->
    <div class="bbsView">
      <dl class="nav prev"><dt>이전글</dt><dd><a href="#">다른 보도자료 제목입니다</a></dd></dl>
      <div class="bbsBtn"><a href="#">목록</a></div>
    </div>
  </body></html>`;
}

describe("gyeongbuk parseDetailBody", () => {
  it("cont_view 본문 추출 + 주석 제목·네비 제외", () => {
    const body = parseDetailBody(detailHtml(`<p>${BODY_TEXT}</p>`));
    expect(body).toContain("경상북도농업기술원");
    expect(body).toContain("적극 지원하겠다"); // 끝까지 (조기종료 X)
    expect(body).not.toContain("다른 보도자료 제목"); // 네비(bbsView 형제) 미섞임
    expect(body).not.toContain("이전글");
  });

  it("주석 닫는 </div--> 가 깊이 추적을 오염시키지 않음(조기종료 방지)", () => {
    // 주석 제거가 없으면 제목(짧은 텍스트)에서 끊겨 본문이 사라짐 → 회귀 가드.
    const body = parseDetailBody(detailHtml(`<p>${BODY_TEXT}</p>`));
    expect(body!.length).toBeGreaterThan(250);
  });

  it("중첩 div(이미지 영역) 안 잘림", () => {
    // reportview_img 안 중첩 div 를 지나 본문 끝까지 캡처.
    const body = parseDetailBody(detailHtml(`<p>${BODY_TEXT}</p>`));
    expect(body).toContain("기반을 마련하기 위해");
  });

  it("cont_view 없으면 null", () => {
    expect(parseDetailBody(`<div class="other"><p>본문 한글입니다</p></div>`)).toBeNull();
  });

  it("닫는 div 없으면 null(junk 방지)", () => {
    expect(
      parseDetailBody(`<div class="cont_view"><p>${"한글 본문 ".repeat(40)}</p>`),
    ).toBeNull();
  });

  it("cont_view_box 유사 class 는 오매칭 안 함(\\b 단어경계)", () => {
    const html = `<div class="cont_view_box"><p>${"한글 본문 ".repeat(40)}</p></div>`;
    expect(parseDetailBody(html)).toBeNull();
  });
});

describe("gyeongbuk parseListPage", () => {
  it("B_NUM seq + title + 작성일 매핑", () => {
    const html = `
      <a href="./page.do?BD_CODE=bbs_bodo&amp;B_NUM=508140501&amp;V_NUM=14342" title="경북도, 바이오산업 엑스포 착수보고회 개최">link</a>
      <span class="date">2026-06-01</span>
    `;
    const items = parseListPage(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("508140501");
    expect(items[0].title).toContain("바이오산업 엑스포");
    expect(items[0].publishedDate).toBe("2026-06-01");
    expect(items[0].sourceUrl).toContain("B_NUM=508140501");
  });
});
