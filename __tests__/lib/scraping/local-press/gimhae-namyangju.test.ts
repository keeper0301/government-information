// ============================================================
// 김해·남양주 parseListPage + parseDetailBody 단위 테스트 (G4)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage as parseGimhaeList,
  parseDetailBody as parseGimhaeBody,
} from "@/lib/scraping/local-press/gimhae";
import {
  parseListPage as parseNamyangjuList,
  parseDetailBody as parseNamyangjuBody,
} from "@/lib/scraping/local-press/namyangju";

describe("gimhae parseListPage", () => {
  it("idx + strong.t1 title + 날짜 매핑 + 새 글 child 제거", () => {
    const html = `
      <a href="?gcode=1172&amp;idx=2585376&amp;amode=view&amp;" class="a1">
        <span class="wrap1texts">
          <strong class="t1">
            김해시, 정책 수립부터 성차별 걸러낸다
            <i class="ic1 new"><span class="t1">새 글</span></i>
          </strong>
        </span>
      </a>
      <span>2026-05-15</span>
      <a href="?gcode=1172&amp;idx=2585374&amp;amode=view&amp;" class="a1">
        <strong class="t1">김해시 분성산 생태숲 황톳길 개장</strong>
      </a>
      <span>2026-05-14</span>
    `;
    const items = parseGimhaeList(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("2585376");
    expect(items[0].title).toContain("김해시");
    expect(items[0].title).toContain("성차별");
    expect(items[0].title).not.toContain("새 글"); // child element 제거
    expect(items[0].publishedDate).toBe("2026-05-15");
    expect(items[0].sourceUrl).toContain("idx=2585376");
  });

  it("같은 idx 중복 link 단일화", () => {
    const html = `
      <a href="?gcode=1172&amp;idx=1234&amp;amode=view&amp;" class="a1"><strong class="t1">첫 link 제목</strong></a>
      <a href="?gcode=1172&amp;idx=1234&amp;amode=view&amp;" class="a1"><strong class="t1">두번째 같은 idx</strong></a>
    `;
    expect(parseGimhaeList(html).length).toBe(1);
  });
});

describe("gimhae parseDetailBody", () => {
  it("board_text_td 안 본문 추출", () => {
    const html = `
      <td class="board_text_td">김해시는 5월 15일 정책 수립 단계부터 성차별을 사전에 걸러내는 시스템을 도입한다고 밝혔다. 이번 정책은 공직사회 양성평등 실현을 위한 것이다.</td>
    `;
    const body = parseGimhaeBody(html);
    expect(body).toContain("김해시");
    expect(body).toContain("성차별");
  });

  it("fallback <p> 한국어 다수", () => {
    const html = `
      <p>김해시는 시민의 안전과 복지를 최우선으로 하는 정책을 추진하고 있으며, 모든 시민이 평등하고 안전한 생활을 할 수 있도록 노력합니다.</p>
      <p>또한 환경 보호와 지속 가능한 발전을 위한 다양한 프로그램을 운영합니다.</p>
    `;
    const body = parseGimhaeBody(html);
    expect(body).toContain("김해시");
  });
});

describe("namyangju parseListPage", () => {
  it("nttNo + em.p-media__heading-text title + time.p-split 날짜", () => {
    const html = `
      <a href="./selectBbsNttView.do?key=2498&amp;bbsNo=68&amp;pageIndex=1&amp;pageUnit=8&amp;searchCnd=all&amp;nttNo=541892" class="p-media__link">
        <em class="p-media__heading-text">남양주시, 대형공사장 안전관리 책임자 현장간담회 개최</em>
      </a>
      <time class="p-split">2026-05-15</time>
      <a href="./selectBbsNttView.do?key=2498&amp;bbsNo=68&amp;nttNo=541774">
        <em class="p-media__heading-text">남양주시, 청년꽃간 2호점 업무협약</em>
      </a>
      <time class="p-split">2026-05-14</time>
    `;
    const items = parseNamyangjuList(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("541892");
    expect(items[0].title).toContain("대형공사장");
    expect(items[0].publishedDate).toBe("2026-05-15");
    expect(items[0].sourceUrl).toContain("nttNo=541892");
  });

  it("같은 nttNo 중복 link 단일화", () => {
    const html = `
      <a href="./selectBbsNttView.do?nttNo=541892"><em class="p-media__heading-text">첫 link 제목</em></a>
      <a href="./selectBbsNttView.do?nttNo=541892"><em class="p-media__heading-text">두번째 같은</em></a>
    `;
    expect(parseNamyangjuList(html).length).toBe(1);
  });
});

describe("namyangju parseDetailBody", () => {
  it("일반 <p> 한국어 다수 (fallback)", () => {
    const html = `
      <p>남양주시는 5월 15일 대형공사장 안전관리 책임자를 위한 현장간담회를 개최했다고 밝혔다.</p>
      <p>이번 간담회는 안전사고 예방과 책임자의 역할 강화를 위한 것이다.</p>
    `;
    const body = parseNamyangjuBody(html);
    expect(body).toContain("남양주시");
    expect(body).toContain("안전관리");
  });

  it("container + p 없음 — null", () => {
    expect(parseNamyangjuBody(`<span>짧음</span>`)).toBeNull();
  });
});
