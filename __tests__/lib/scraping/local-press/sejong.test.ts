// ============================================================
// 세종특별자치시 parseListPage + parseDetailBody 단위 테스트 (G4)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/sejong";

describe("sejong parseListPage", () => {
  it("nttId (alphanumeric) + title + 날짜 매핑", () => {
    const html = `
      <a href="/bbs/R0079/view.do?nttId=B000000153891Aq1qA2n&mno=sub02_0401">세종낙화축제 10만 명 이상 찾아 전통 불꽃비 즐겼다</a>
      <td data-cell-header="등록일">2026-05-17</td>
      <a href="/bbs/R0079/view.do?nttId=B000000153870Pf8qA7n&mno=sub02_0401">세종시, 충청권 바이오·미래모빌리티 일자리 혁신지 도약</a>
      <td data-cell-header="등록일">2026-04-29</td>
    `;
    const items = parseListPage(html);
    expect(items.length).toBe(2);
    expect(items[0].seq).toBe("B000000153891Aq1qA2n");
    expect(items[0].title).toContain("낙화축제");
    expect(items[0].publishedDate).toBe("2026-05-17");
    expect(items[0].sourceUrl).toContain("nttId=B000000153891Aq1qA2n");
  });

  it("같은 nttId 중복 link 단일화", () => {
    const html = `
      <a href="/bbs/R0079/view.do?nttId=B0001Aq1qA2n">첫 link 제목</a>
      <a href="/bbs/R0079/view.do?nttId=B0001Aq1qA2n">두번째 같은</a>
    `;
    expect(parseListPage(html).length).toBe(1);
  });
});

describe("sejong parseDetailBody", () => {
  it("ui bbs--view--content 안 <p> 본문 추출", () => {
    const html = `
      <div class="ui bbs--view--content">
        <p>2026 세종낙화축제는 지난 16일 세종호수공원 일원에서 세종특별자치시 주최로 열렸다.</p>
        <p>이날 오후 7시 30분부터 약 2시간 동안 낙화봉에서 천천히 은은하게 타며 내린 불꽃비는 세종의 밤하늘을 물들였다.</p>
      </div>
      <div class="next">다른</div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("세종낙화축제");
    expect(body).toContain("불꽃비");
  });

  it("HTML entity 디코딩 (&hellip; &middot;)", () => {
    const html = `
      <div class="ui bbs--view--content">
        <p>세종시는 시민의 안전과 복지를 위해 다양한 정책을 추진합니다&hellip; 또한 환경&middot;경제 발전에도 힘쓰고 있습니다.</p>
      </div>
      <div>다른</div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("정책을 추진합니다…");
    expect(body).toContain("환경·경제");
  });

  it("container 없음 — null", () => {
    expect(parseDetailBody(`<p>일반 단락 본문</p>`)).toBeNull();
  });
});
