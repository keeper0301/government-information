// ============================================================
// 서초·서울 중구 보도자료 parser 단위 테스트 (2026-06-01)
// ============================================================
// 서초: eGovFrame site/ex/bbs (cbIdx=61), 본문 view_contents div.
// 서울 중구: 자체 content.do (cmsid=14390), 본문 td.view_txt.

import { describe, it, expect } from "vitest";
import {
  parseListPage as parseSeocho,
  parseDetailBody as bodySeocho,
} from "@/lib/scraping/local-press/seocho";
import {
  parseListPage as parseJunggu,
  parseDetailBody as bodyJunggu,
} from "@/lib/scraping/local-press/junggu_seoul";

describe("서초구 parseListPage (cbIdx=61)", () => {
  it("bcIdx/title/등록일 추출 (anchor 길어 1100 slice)", () => {
    const gap = " ".repeat(300);
    const html = `
      <tr>
        <td class="no">4512</td>
        <td class="title"><a href="/site/seocho/ex/bbs/View.do?cbIdx=61&amp;bcIdx=409385" onclick="doBbsContentFView(409385);return false;" title="4512번글">서초구, 서리풀 건축학교 수강생 모집</a></td>
        <td data-label="담당부서">건축과</td>${gap}<td data-label="등록일">2026-05-31</td>
      </tr>
    `;
    const items = parseSeocho(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("409385");
    expect(items[0].title).toBe("서초구, 서리풀 건축학교 수강생 모집");
    expect(items[0].publishedDate).toBe("2026-05-31");
    expect(items[0].sourceUrl).toBe(
      "https://www.seocho.go.kr/site/seocho/ex/bbs/View.do?cbIdx=61&bcIdx=409385",
    );
  });

  it("cbIdx=610 등 다른 게시판 제외 (cbIdx=61& 종결)", () => {
    const html = `
      <a href="/site/seocho/ex/bbs/View.do?cbIdx=610&amp;bcIdx=111">다른 게시판 글</a><td data-label="등록일">2026-05-31</td>
      <a href="/site/seocho/ex/bbs/View.do?cbIdx=61&amp;bcIdx=222">서초 보도자료 글</a><td data-label="등록일">2026-05-31</td>
    `;
    const items = parseSeocho(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("222");
  });

  it("view_contents div-depth 본문 + 중첩 div 안 잘림", () => {
    const LONG = "서울 서초구는 미래 세대인 청소년들이 건축적 사고를 통해 창의적 인재로 성장하도록 돕는 서리풀 건축학교 수강생을 모집한다고 밝혔다. 이번 프로그램은 현직 건축사와 함께 도시와 공간을 직접 설계해보는 체험형 교육으로 운영되며, 관내 초·중·고 학생 누구나 신청할 수 있다. 구는 교육을 통해 청소년들이 건축에 대한 흥미를 키우고 진로 탐색의 기회를 가질 수 있을 것으로 기대한다고 밝혔으며 많은 관심과 참여를 당부했다.";
    const html = `
      <div class="view_contents">
        <p>${LONG}</p>
        <div class="img"><img src="/a.jpg"/></div>
        <p>신청은 구청 누리집에서 가능하다.</p>
      </div>
    `;
    const body = bodySeocho(html);
    expect(body).toContain("서리풀 건축학교");
    expect(body).toContain("누리집에서 가능");
  });

  it("서초 안전 분기 (view_contents 없음/250 미만 → null)", () => {
    expect(bodySeocho(`<div class="other">짧음</div>`)).toBeNull();
    expect(bodySeocho(`<div class="view_contents"><p>짧은 본문</p></div>`)).toBeNull();
  });
});

describe("서울 중구 parseListPage (content.do cmsid=14390)", () => {
  it("cid/title/date 추출 + sourceUrl", () => {
    const html = `
      <li>
        <a href="/content.do?cmsid=14390&amp;mode=view&amp;cid=145137101">중구, 여름철 폭염 대비 총력…민간 무더위쉼터 확대</a>
        <span class="date">2026-06-01</span>
      </li>
    `;
    const items = parseJunggu(html);
    expect(items).toHaveLength(1);
    expect(items[0].seq).toBe("145137101");
    expect(items[0].title).toContain("여름철 폭염 대비");
    expect(items[0].publishedDate).toBe("2026-06-01");
    expect(items[0].sourceUrl).toBe(
      "https://www.junggu.seoul.kr/content.do?cmsid=14390&mode=view&cid=145137101",
    );
  });

  it("제목에 YYYY-MM-DD 가 있어도 작성일은 row 날짜 (anchor 뒤 slice)", () => {
    const html = `
      <li>
        <a href="/content.do?cmsid=14390&amp;mode=view&amp;cid=999">중구, 2026-12-25 성탄 행사 안내</a>
        <span class="date">2026-06-01</span>
      </li>
    `;
    const items = parseJunggu(html);
    expect(items[0].publishedDate).toBe("2026-06-01"); // 제목의 2026-12-25 아님
  });

  it("td.view_txt 본문 + 중첩 table 안 잘림", () => {
    const LONG = "중구는 9월 말까지 여름철 폭염 종합대책을 추진한다고 밝혔다. 민간 무더위쉼터와 스마트 그늘막을 확대하고 폭염 대응 체계를 강화한다. 특히 올해는 폭염중대경보와 열대야주의보를 신설해 단계별 대응을 강화하고, 대형마트와 종교시설 등 민간 공간을 무더위쉼터로 추가 지정해 누구나 가까운 곳에서 더위를 피할 수 있도록 했다. 구는 취약계층 보호를 위해 방문 건강관리와 안부 확인도 병행할 계획이라고 밝혔다.";
    const html = `
      <table class="board_view_02"><tbody>
        <tr><th class="row">내용</th><td class="view_txt">
          <p>${LONG}</p>
          <table><tbody><tr><td>구분</td><td>일정</td></tr></tbody></table>
          <p>자세한 사항은 구청에 문의하면 된다.</p>
        </td></tr>
      </tbody></table>
    `;
    const body = bodyJunggu(html);
    expect(body).toContain("폭염 종합대책"); // 표 앞
    expect(body).toContain("구청에 문의"); // 표 뒤 (조기 잘림 X)
  });

  it("서울 중구 안전 분기 (view_txt 없음/250 미만 → null)", () => {
    expect(bodyJunggu(`<td class="other">짧음</td>`)).toBeNull();
    expect(bodyJunggu(`<td class="view_txt"><p>짧은 본문</p></td>`)).toBeNull();
  });
});
