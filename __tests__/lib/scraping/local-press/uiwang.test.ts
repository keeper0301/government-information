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

describe("uiwang parseDetailBody", () => {
  it("txtWrap 안 실제 본문 추출", () => {
    const html = `
      <div class="txtWrap">
        <!-- 내용 -->
        <p><span style="font-family: 굴림;">의왕시 정신건강복지센터가 최근 모락중학교에서 또래 상담 동아리 학생들을 대상으로 청소년 생명지킴이 서포터스 토담이 프로그램을 운영했다.</span></p>
      </div>
      <div class="btnWrap big"><a>목록</a></div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("의왕시 정신건강복지센터");
    expect(body).toContain("토담이");
  });

  it("bbs-view 메타 테이블은 본문으로 잡지 않음 (과거 버그 회귀 방어)", () => {
    const html = `
      <div class="bbs-view">보도자료 상세 - 제목, 작성자, 작성일, 조회수, 첨부파일, 상세내용 제공 표 제목 의왕시 사업 작성자 기업일자리과 작성일 2026-05-08 조회수 70</div>
    `;
    // txtWrap 컨테이너가 없으므로 null (메타가 본문으로 저장되던 버그 방지)
    expect(parseDetailBody(html)).toBeNull();
  });

  it("50자 미만 — null", () => {
    expect(parseDetailBody(`<div class="txtWrap">짧음</div>`)).toBeNull();
  });
});
