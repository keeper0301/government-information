// ============================================================
// 의왕시 parseListPage + parseDetailBody 단위 테스트
// ============================================================
// 2026-06-01 cron 검증에서 발견: 본문이 bbs-view(메타 테이블)로 저장되던 버그 +
// 제목 끝 "첨부파일" 라벨 혼입. txtWrap 본문 교정 + title strip 회귀 방어.

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/uiwang";

describe("uiwang parseListPage", () => {
  it("seq + title + 날짜 매핑", () => {
    const html = `
      <a href="/UWKORINFO0201/7000810/?curPage=1" class="tit">의왕시정신건강복지센터, 청소년 생명지킴이 서포터스 운영 시작</a>
      <td>2026-05-19</td>
    `;
    const items = parseListPage(html);
    expect(items.length).toBe(1);
    expect(items[0].seq).toBe("7000810");
    expect(items[0].title).toContain("청소년 생명지킴이");
    expect(items[0].publishedDate).toBe("2026-05-19");
    expect(items[0].sourceUrl).toContain("/UWKORINFO0201/7000810/");
  });

  it("제목 끝 '첨부파일' 라벨 strip", () => {
    const html = `
      <a href="/UWKORINFO0201/7000820/?curPage=1" class="tit">의왕시, 2026년 돌봄 취약가구 지원 사업 추가 신청<span class="ico">첨부파일</span></a>
      <td>2026-05-18</td>
    `;
    const items = parseListPage(html);
    expect(items.length).toBe(1);
    expect(items[0].title).toBe("의왕시, 2026년 돌봄 취약가구 지원 사업 추가 신청");
    expect(items[0].title.endsWith("첨부파일")).toBe(false);
  });

  it("title 5자 미만 skip", () => {
    const html = `<a href="/UWKORINFO0201/1/?curPage=1" class="tit">짧음</a><td>2026-05-01</td>`;
    expect(parseListPage(html)).toEqual([]);
  });
});

// 2026-06-02 — txtWrap 을 div 깊이 추적으로 추출(구 non-greedy 첫 </div> 는 중첩 div 에서
// 조기 종료 → thin skip). 길이 하한은 factory(BODY_MIN_LEN 250)에 일임.
describe("uiwang parseDetailBody (txtWrap div-depth)", () => {
  const LONG =
    "의왕시 정신건강복지센터가 최근 모락중학교에서 또래 상담 동아리 학생들을 대상으로 청소년 " +
    "생명지킴이 서포터스 토담이 프로그램을 운영했다. 이번 프로그램은 또래 상담자가 친구의 " +
    "어려움을 살피고 전문기관으로 연계하는 역할을 익히도록 구성됐으며 학생들의 호응이 높았다.";

  it("txtWrap 본문 추출 + 중첩 div(이미지) 안 잘림", () => {
    const html = `
      <div class="txtWrap">
        <p><span style="font-family: 굴림;">${LONG}</span></p>
        <div class="img"><img src="/a.jpg"/></div>
        <p>자세한 내용은 의왕시청 누리집에서 확인할 수 있다고 밝혔다.</p>
      </div>
      <div class="btnWrap big"><a>목록</a></div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("정신건강복지센터"); // 이미지 div 앞
    expect(body).toContain("누리집에서 확인"); // 뒤 (조기 잘림 X)
    expect(body).not.toContain("목록"); // btnWrap(형제) 미포함
  });

  it("bbs-view 메타 테이블은 본문으로 잡지 않음 (txtWrap 없으면 null)", () => {
    const html = `
      <div class="bbs-view">보도자료 상세 - 제목, 작성자, 작성일, 조회수, 첨부파일, 상세내용 제공 표 제목 의왕시 사업 작성자 기업일자리과 작성일 2026-05-08 조회수 70</div>
    `;
    expect(parseDetailBody(html)).toBeNull();
  });

  it("닫는 div 없으면 null(junk 방지)", () => {
    expect(parseDetailBody(`<div class="txtWrap"><p>${LONG}</p>`)).toBeNull();
  });
});
