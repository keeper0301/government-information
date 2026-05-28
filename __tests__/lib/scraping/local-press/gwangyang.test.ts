// ============================================================
// 광양시 parseListPage + parseDetailBody 단위 테스트 (전남 batch)
// ============================================================
// 2026-05-29 본문 파싱 수리 회귀 방지:
//   - 본문은 <td colspan="4" class="view_content"> (class 앞 속성 + td 태그)
//   - 본문에 HWP/워드 export 중첩 table 이 섞여 </td> 경계가 깨지던 사고
//   - 첨부파일 행(view_file) 마커까지 잘라 중첩 table 영향 제거

import { describe, it, expect } from "vitest";
import {
  parseListPage,
  parseDetailBody,
} from "@/lib/scraping/local-press/gwangyang";

describe("gwangyang parseListPage", () => {
  it("list_no + title + 작성일 매핑", () => {
    const html = `
      <td class="p-subject">
        <a href="/board.es?mid=a11007000000&amp;bid=0057&amp;act=view&amp;list_no=200442" title="사전투표소 점검">
          광양시, 제9회 전국동시지방선거 사전투표소 현장점검 실시
        </a>
      </td>
      <td class="p-date">2026-05-28</td>
    `;
    const items = parseListPage(html);
    expect(items.length).toBe(1);
    expect(items[0].seq).toBe("200442");
    expect(items[0].title).toContain("사전투표소");
    expect(items[0].publishedDate).toBe("2026-05-28");
    expect(items[0].sourceUrl).toContain("list_no=200442");
    expect(items[0].sourceUrl).toContain("gwangyang.go.kr");
  });

  it("같은 list_no 중복 — 단일화", () => {
    const html = `
      <a href="/board.es?mid=a11007000000&bid=0057&act=view&list_no=111">첫 번째 제목입니다</a>
      <a href="/board.es?mid=a11007000000&bid=0057&act=view&list_no=111">중복 제목입니다</a>
    `;
    expect(parseListPage(html).length).toBe(1);
  });
});

describe("gwangyang parseDetailBody", () => {
  // class 앞에 colspan 속성, 태그가 td → 기존 <div class= regex 로는 실패하던 케이스
  it("td.view_content (class 앞 colspan) 추출", () => {
    const html = `
      <tr>
        <td colspan="4" class="view_content">
          <p>광양시는 2026년 5월 28일 제9회 전국동시지방선거 사전투표소 현장을 최종 점검했다고 밝혔다.</p>
          <p>담당부서: 총무과 / 연락처: 797-2240</p>
        </td>
      </tr>
      <tr>
        <th scope="row" id="t1row03">첨부파일</th>
        <td colspan="3" class="view_file"><ul></ul></td>
      </tr>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("광양시는");
    expect(body).toContain("사전투표소");
    expect(body).toContain("담당부서: 총무과");
    // 첨부파일 라벨이 본문 끝에 섞이지 않음
    expect(body).not.toContain("첨부파일");
  });

  it("본문 내 중첩 table 이 있어도 전체 본문 캡처 (핵심 회귀)", () => {
    const html = `
      <td colspan="4" class="view_content">
        <p>광양시는 다음과 같이 행사를 개최한다고 밝혔다.</p>
        <table><tbody><tr><td>구분</td><td>내용</td></tr>
        <tr><td>일시</td><td>6월 1일</td></tr></tbody></table>
        <p>많은 시민들의 참여를 바란다고 당부했다. 담당부서: 관광과 / 연락처: 797-1952</p>
      </td>
      </tr>
      <tr><th>첨부파일</th><td class="view_file"></td></tr>
    `;
    const body = parseDetailBody(html);
    // 중첩 table 앞 문장 + 뒤 문장 모두 포함되어야 함 (조기 종료 X)
    expect(body).toContain("행사를 개최");
    expect(body).toContain("참여를 바란다");
    expect(body).toContain("연락처: 797-1952");
  });

  it("MS Word/HWP 조건부 주석 제거", () => {
    const html = `
      <td colspan="4" class="view_content">
        <p class="0"><!--[if !supportEmptyParas]--><b>&nbsp;</b><!--[endif]--></p>
        <p><span style="font-family:굴림;">광양시는 환경&middot;경제 발전을 위한 사업을 지속 추진하겠다고 밝혔다. 자세한 내용은 시청에 문의 바란다.</span></p>
      </td>
      </tr>
      <tr><th>첨부파일</th><td class="view_file"></td></tr>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("환경·경제");
    expect(body).not.toContain("supportEmptyParas");
    expect(body).not.toContain("endif");
  });

  it("view_content 없음 — null", () => {
    expect(parseDetailBody(`<p>일반 본문만 있고 view_content 셀이 없음</p>`)).toBeNull();
  });

  // 끝 마커(view_file/첨부파일/btnArea)가 전혀 없으면 전체 페이지를 통째로 잡는 게
  // 아니라 null 을 반환해야 함 (garbage insert 구조적 차단 — 코드리뷰 회귀 방지).
  it("끝 마커 없으면 — null (전체 페이지 캡처 방지)", () => {
    const html = `
      <td colspan="4" class="view_content">
        <p>광양시는 본문이 있으나 첨부파일 행이나 버튼영역 마커가 전혀 없는 비정상 페이지다.</p>
    `;
    expect(parseDetailBody(html)).toBeNull();
  });
});
