// gijang-eminwon parser regex silent 회귀 방어.
// 정찰 dump 기준 mock HTML 로 parseListItems · parseDetailBody · silentSkips 검증.

import { describe, it, expect } from "vitest";
import {
  parseListItems,
  parseDetailBody,
} from "@/lib/scraping/local-press/gijang-eminwon";

// 정찰 dump 패턴: tr 안에 번호/제목/부서/등록일/조회수 + searchDetail('N') onclick.
const MOCK_LIST_HTML = `
<table>
  <tr><th>번호</th><th>제목</th><th>부서</th><th>등록일</th></tr>
  <tr>
    <td>4909</td>
    <td><a href="#" onclick="javascript:searchDetail('5086')">기장군, 환경관리실태 평가 우수기관 선정</a></td>
    <td>환경위생과</td>
    <td>2026-05-29</td>
    <td>0</td>
  </tr>
  <tr>
    <td>4908</td>
    <td><a href="#" onclick="javascript:searchDetail('5085')">기장군 드림스타트 아동에 멀티비타민 기탁</a></td>
    <td>교육청소년과</td>
    <td>2026-05-28</td>
    <td>3</td>
  </tr>
  <tr>
    <td>4907</td>
    <td><a href="#" onclick="javascript:searchDetail('5084')">기장군, 제11회 반딧불이 생태체험 학습행사 개최</a></td>
    <td>농업기술센터</td>
    <td>2026-05-28</td>
    <td>0</td>
  </tr>
</table>
`;

// detail dump: td 안에 메타정보 + 본문 묶음. 본문이 가장 긴 td.
const MOCK_DETAIL_HTML = `
<table>
  <tr><td>구분</td><td>보도자료</td></tr>
  <tr><td>제목</td><td>기장군, 환경관리실태 평가 우수기관 선정</td></tr>
  <tr><td>부서</td><td>환경위생과</td></tr>
  <tr><td>내용</td><td>기장군(군수 정종복)은 기후에너지환경부가 주관한 2026년 지자체 배출업소 환경관리실태평가에서 기초지자체 중 4그룹 1위를 차지하며 우수기관으로 선정됐다고 29일 밝혔다. 배출업소 환경관리실태평가는 지자체의 환경오염물질 배출사업장 지도점검 역량을 강화하고 환경관리 수준을 높이기 위해 기후에너지환경부가 매년 실시하는 평가다. 전국 240개 기초지자체가 참여한 이번 평가에서 기장군은 환경관리실태와 정책 추진력 모두 높은 점수를 받았다. 기장군은 앞으로도 환경오염물질 배출사업장에 대한 체계적 지도점검을 통해 군민이 체감할 수 있는 깨끗하고 안전한 환경을 만드는 데 행정력을 집중할 계획이다.</td></tr>
</table>
`;

describe("gijang-eminwon parseListItems", () => {
  it("정찰 dump 패턴 — 3건 정확 추출 (newsEpctNo + 제목 + 부서 + 등록일)", () => {
    const items = parseListItems(MOCK_LIST_HTML);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      newsEpctNo: "5086",
      title: "기장군, 환경관리실태 평가 우수기관 선정",
      department: "환경위생과",
      publishedDate: "2026-05-29",
    });
    expect(items[2].newsEpctNo).toBe("5084");
  });

  it("searchDetail onclick 없는 tr 은 skip (헤더 tr)", () => {
    const items = parseListItems(MOCK_LIST_HTML);
    // 헤더 tr (번호/제목/부서/등록일) 은 onclick 없어 4건이 아닌 3건만.
    expect(items).toHaveLength(3);
  });

  it("제목 추출 실패 tr 은 silentSkips 로 노출 (운영 audit 가시화)", () => {
    // 제목이 5자 미만 + 한국어 1자 — 추출 안 됨.
    const html = `
      <tr>
        <td>1</td>
        <td><a href="#" onclick="javascript:searchDetail('999')">짧</a></td>
        <td>부서</td>
        <td>2026-05-30</td>
      </tr>
    `;
    const skips: string[] = [];
    const items = parseListItems(html, skips);
    expect(items).toHaveLength(0);
    expect(skips).toContain("999");
  });

  it("HTML 변경 회귀 — searchDetail 패턴 깨지면 0건 (silent skip 0)", () => {
    // onclick="otherFn('N')" 같이 패턴 다르면 매칭 0.
    const html = `<tr><td><a onclick="otherFn('1')">제목</a></td></tr>`;
    const skips: string[] = [];
    const items = parseListItems(html, skips);
    expect(items).toHaveLength(0);
    // silentSkips 도 0 — searchDetail 매칭 자체가 안 됨 (id 추출 단계 fail).
    expect(skips).toHaveLength(0);
  });
});

describe("gijang-eminwon parseDetailBody", () => {
  it("td 안 가장 긴 한국어 본문 추출 (≥250자)", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);
    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("기장군");
    expect(body).toContain("환경관리실태평가");
  });

  it("본문 250자 미만 = null (silent skip — thin content 차단)", () => {
    const html = `<td>짧은 본문 한 줄만 있어 250자 안 됨.</td>`;
    expect(parseDetailBody(html)).toBeNull();
  });

  it("td 안 한국어 없음 = null", () => {
    const html =
      `<td>${"english only content lorem ipsum dolor sit amet ".repeat(20)}</td>`;
    expect(parseDetailBody(html)).toBeNull();
  });
});
