// 광주 북구 eminwon parser 회귀 방어. list/detail 파싱은 공통 _eminwon_helper
// 재사용(기장·부산북구와 공유)이라 re-export 동작만 검증하고, 광주 북구 고유의
// detail POST body(form1 전체 필드) 빌더는 별도로 필드 정합성을 검증한다.

import { describe, it, expect } from "vitest";
import {
  parseListItems,
  parseDetailBody,
  buildBukguGwangjuDetailBody,
} from "@/lib/scraping/local-press/bukgu-gwangju-eminwon";

// 2026-06-07 라이브 정찰 패턴: tr 안 번호/제목/부서/등록일/조회수 + searchDetail('N').
const MOCK_LIST_HTML = `
<table>
  <tr><th>번호</th><th>제목</th><th>부서</th><th>등록일</th><th>조회</th></tr>
  <tr>
    <td>10921</td>
    <td class="subject"><a href="#" onclick="javaScript:searchDetail('10993'); return false;">북구, 밀폐공간 안전사고 예방교육 실시</a></td>
    <td>하천방재과</td>
    <td>2026-06-07</td>
    <td>0</td>
  </tr>
  <tr>
    <td>10920</td>
    <td class="subject"><a href="#" onclick="javaScript:searchDetail('10992'); return false;">북구, 선거 관련 현수막 철거 안내</a></td>
    <td>안전총괄과</td>
    <td>2026-06-04</td>
    <td>0</td>
  </tr>
</table>
`;

const MOCK_DETAIL_HTML = `
<table>
  <tr><td>제목</td><td>북구, 반려동물 등록 자진신고 기간 운영</td></tr>
  <tr><td>내용</td><td>광주광역시 북구(구청장 문인)가 성숙한 반려동물 문화 조성과 동물 유기 예방을 위해 ‘2026년 동물등록 자진신고 기간’을 운영한다고 4일 밝혔다. 이번 자진신고는 반려동물 등록제도 활성화와 체계적인 동물 관리를 위해 추진되며 상·하반기 총 2차례 실시된다. 1차 자진신고 기간은 오는 6월 30일까지이며 2차 자진신고 기간은 9월 1일부터 10월 31일까지이다. 등록 대상은 2개월령 이상인 강아지는 전부 해당되며 고양이의 경우는 선택적으로 등록할 수 있다.</td></tr>
</table>
`;

describe("bukgu-gwangju-eminwon parseListItems", () => {
  it("정찰 패턴 — 2건 추출 (newsEpctNo + 제목 + 부서 + 등록일)", () => {
    const items = parseListItems(MOCK_LIST_HTML);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      newsEpctNo: "10993",
      department: "하천방재과",
      publishedDate: "2026-06-07",
    });
    expect(items[0].title).toContain("밀폐공간");
  });
});

describe("bukgu-gwangju-eminwon parseDetailBody", () => {
  it("td 안 가장 긴 한국어 본문 추출 (≥250자)", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);
    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("자진신고");
  });

  it("250자 미만 = null", () => {
    expect(parseDetailBody(`<td>짧은 본문.</td>`)).toBeNull();
  });
});

describe("bukgu-gwangju-eminwon buildBukguGwangjuDetailBody", () => {
  it("form1 전체 필드 — subCheck=N·pageIndex=1·빈 검색필드 4종 포함", () => {
    const body = buildBukguGwangjuDetailBody("10993");
    const p = new URLSearchParams(body);
    // 표준 detailBody 와 다른 광주 북구 고유 필드(이게 없으면 본문 미수신)
    expect(p.get("subCheck")).toBe("N");
    expect(p.get("pageIndex")).toBe("1");
    expect(p.get("data_sj")).toBe("");
    expect(p.get("cha_dep_code_nm")).toBe("");
    expect(p.get("data_prvd_ymd_from")).toBe("");
    expect(p.get("data_prvd_ymd_to")).toBe("");
    // 공통 필수 필드
    expect(p.get("news_epct_no")).toBe("10993");
    expect(p.get("method")).toBe("selectOfrNews");
    expect(p.get("jndinm")).toBe("OfrBcAdvNewsEJB");
    expect(p.get("title")).toBe("보도자료");
  });
});
