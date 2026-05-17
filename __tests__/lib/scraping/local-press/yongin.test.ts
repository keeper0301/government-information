// ============================================================
// 용인특례시 parseListPage + parseDetailBody 단위 테스트 (G4)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/yongin";

describe("yongin parseListPage", () => {
  it("opView seq + 한국어 title + 날짜는 seq 앞 8자리에서 도출", () => {
    const html = `
      <a href="BD_selectBbs.do?q_bbsCode=1020&amp;q_bbscttSn=20260515093505990">용인특례시, 감염병 관리위원회 개최</a>
      <a href="BD_selectBbs.do?q_bbsCode=1020&amp;q_bbscttSn=20260514103022100">용인시, 2026년 청년 일자리 매칭 행사</a>
    `;
    const items = parseListPage(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("20260515093505990");
    expect(items[0].title).toContain("감염병 관리위원회");
    expect(items[0].publishedDate).toBe("2026-05-15"); // seq 앞 8자리에서 도출
    expect(items[0].sourceUrl).toContain(
      "q_bbscttSn=20260515093505990",
    );
    expect(items[1].publishedDate).toBe("2026-05-14");
  });

  it("같은 seq 중복 link 단일화 (썸네일 + 제목 = 2 link 같은 seq)", () => {
    const html = `
      <a href="BD_selectBbs.do?q_bbsCode=1020&amp;q_bbscttSn=20260515093505990">용인 첫 link 한국어 제목</a>
      <a href="BD_selectBbs.do?q_bbsCode=1020&amp;q_bbscttSn=20260515093505990">용인 두번째 link 같은 seq</a>
    `;
    expect(parseListPage(html).length).toBe(1);
  });

  it("title 4자 미만 skip (image alt 충돌 방지)", () => {
    const html = `<a href="BD_selectBbs.do?q_bbsCode=1020&q_bbscttSn=20260515093505990">짧다</a>`;
    expect(parseListPage(html)).toEqual([]);
  });
});

describe("yongin parseDetailBody", () => {
  it("table 안 <p> 한국어 본문 추출 (fallback)", () => {
    const html = `
      <table>
        <tr>
          <td>
            <p>용인특례시는 13일 처인구보건소 3층 소회의실에서 &lsquo;2026년 제1회 용인시 감염병 관리위원회&rsquo;를 열었다고 14일 밝혔다.</p>
            <p>또한 올해 변경된 법정 감염병 관리지침에 따른 신속한 현장 적용 방안도 다뤘다.</p>
          </td>
        </tr>
      </table>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("용인특례시");
    expect(body).toContain("'2026년 제1회 용인시 감염병 관리위원회'");
    expect(body).toContain("법정 감염병");
  });

  it("article-detail webView 우선 (있을 때)", () => {
    const html = `
      <div id="webView" class="article-detail">용인 webView 우선 본문 한국어로 50자 이상 충분히 길게 들어있어야 합니다. 그래야 fallback 으로 가지 않습니다.</div>
      <div id="mobileView" class="article-detail">다른</div>
      <p>fallback 으로 가면 안 됨 — webView 가 우선 매칭되어야 합니다</p>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("webView 우선");
  });

  it("fileDownload 텍스트 제외", () => {
    const html = `
      <p>fileDownload 안내는 본문 아님 무시</p>
      <p>용인시는 실제 본문 한국어 내용으로 충분히 길게 작성되어 있으며 50자 이상의 의미 있는 정책 정보를 제공합니다.</p>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("용인시");
    expect(body).not.toContain("fileDownload");
  });

  it("container 없음 + p 없음 — null", () => {
    expect(parseDetailBody(`<span>단순 텍스트</span>`)).toBeNull();
  });
});
