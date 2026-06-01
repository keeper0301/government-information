// ============================================================
// 부산 parseListPage + parseDetailBody 단위 테스트 (G4)
// ============================================================
// (수원은 2026-06-02 Playwright 경로 이관으로 정적 parser 삭제 → 본 파일에서 제거)

import { describe, it, expect } from "vitest";
import {
  parseListPage as parseBusanList,
  parseDetailBody as parseBusanBody,
} from "@/lib/scraping/local-press/busan";

describe("busan parseListPage", () => {
  it("/nbtnewsBU/{seq} link + title 매핑", () => {
    const html = `
      <a href="/nbtnewsBU/1731118?curPage=">부산시, BTS 월드투어 부산 공연 대비 가격안정 대책회의</a>
      <span>2026-05-15</span>
      <a href="/nbtnewsBU/1731116?srchText=">부산시, 신년 인사회 5대 종단 화합 메시지</a>
      <span>2026-05-14</span>
    `;
    const items = parseBusanList(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("1731118");
    expect(items[0].title).toContain("BTS");
    expect(items[0].publishedDate).toBe("2026-05-15");
    expect(items[0].sourceUrl).toBe(
      "https://www.busan.go.kr/nbtnewsBU/1731118",
    );
  });

  it("같은 seq 중복 link 단일화", () => {
    const html = `
      <a href="/nbtnewsBU/1731118">제목 첫번째 노출 충분히 길게</a>
      <a href="/nbtnewsBU/1731118">제목 두번째 같은 row 의 동일 seq</a>
    `;
    const items = parseBusanList(html);
    expect(items.length).toBe(1); // 중복 차단
  });

  it("title 5자 미만 skip", () => {
    const html = `<a href="/nbtnewsBU/1234">짧음</a>`;
    expect(parseBusanList(html)).toEqual([]);
  });
});

describe("busan parseDetailBody", () => {
  it("<p> 한국어 본문 추출", () => {
    const html = `
      <p>부산시는 박형준 시장 주재로 BTS 월드투어 가격안정 대책회의를 개최했다.</p>
      <p>관계 실·국 및 유관기관 참여 민관합동 대책회의 진행으로 숙박업소 가격을 안정화한다.</p>
    `;
    const body = parseBusanBody(html);
    expect(body).toContain("부산시");
    expect(body).toContain("박형준");
  });
});
