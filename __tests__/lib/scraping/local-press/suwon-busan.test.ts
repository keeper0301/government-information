// ============================================================
// 수원·부산 parseListPage + parseDetailBody 단위 테스트 (G4)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage as parseSuwonList,
  parseDetailBody as parseSuwonBody,
} from "@/lib/scraping/local-press/suwon";
import {
  parseListPage as parseBusanList,
  parseDetailBody as parseBusanBody,
} from "@/lib/scraping/local-press/busan";

describe("suwon parseListPage", () => {
  it("jsView onclick seq + title 매핑", () => {
    const html = `
      <td class="p-subject">
        <a href="#" onclick="jsView('1043', '20260515113830537', 'Y', 'Y'); return false;">
          수원특례시, 중증장애인생산품 우선구매 전국 1위
        </a>
      </td>
      <td>2026/05/15</td>
      <td class="p-subject">
        <a href="#" onclick="jsView('1043', '20260515113749412', 'Y', 'Y'); return false;">
          수원특례시, 풍수해 복합재난 대응 훈련 새글
        </a>
      </td>
      <td>2026/05/14</td>
    `;
    const items = parseSuwonList(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("20260515113830537");
    expect(items[0].title).toContain("중증장애인생산품");
    expect(items[0].publishedDate).toBe("2026-05-15");
    expect(items[0].sourceUrl).toContain("bbsCd=1043&seq=20260515113830537");
    expect(items[1].title).not.toMatch(/새글$/); // "새글" suffix 제거 확인
  });

  it("빈 HTML — 빈 배열", () => {
    expect(parseSuwonList("")).toEqual([]);
  });
});

describe("suwon parseDetailBody", () => {
  it("<p> 한국어 본문 추출", () => {
    const html = `
      <p>수원특례시는 14일 우만현대아파트 재건축 부지에서 안전한국훈련을 진행했다.</p>
      <p>김현수 권한대행은 비상 기구 소집과 피해 상황 공유를 점검했다.</p>
    `;
    const body = parseSuwonBody(html);
    expect(body).toContain("수원특례시");
    expect(body).toContain("김현수");
  });

  it("jsView 안내문 제외", () => {
    const html = `
      <p>실제 본문 한국어 내용 ㅏ가나다라마바사 충분히 긴 문장</p>
      <p>jsView 함수 호출 onclick 안내문 element 보호용</p>
    `;
    const body = parseSuwonBody(html);
    expect(body).toContain("실제 본문");
    expect(body).not.toContain("jsView");
  });
});

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
