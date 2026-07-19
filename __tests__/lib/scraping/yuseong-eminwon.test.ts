// yuseong-eminwon parser 회귀 방어. 유성구 실제 정찰 HTML 패턴
// (eminwon OfrBcAdvNewsEJB + searchDetail)으로 re-export 동작 검증.

import { describe, expect, it } from "vitest";
import {
  parseListItems,
  parseDetailBody,
} from "@/lib/scraping/local-press/yuseong-eminwon";

const MOCK_LIST_HTML = `
<table>
  <tr>
    <th>번호</th><th>제목</th><th>담당부서</th><th>등록일</th><th>조회수</th>
  </tr>
  <tr>
    <td>928</td>
    <td class="td_left"><a href="#" onclick="javaScript:searchDetail('928')">유성구, 평생학습 분위기 확산</a></td>
    <td>교육과학과</td>
    <td>2014-03-12</td>
    <td>1</td>
  </tr>
</table>
`;

const MOCK_DETAIL_HTML = `
<table>
  <tr><td>제목</td><td>유성구, 평생학습 분위기 확산</td></tr>
  <tr><td>내용</td><td>대전 유성구는 주민 누구나 가까운 생활권에서 배움의 기회를 누릴 수 있도록 평생학습 프로그램을 확대 운영한다고 밝혔다. 이번 프로그램은 지역 주민의 수요를 반영해 인문교양, 시민참여, 직업능력, 문화예술 등 다양한 분야로 구성됐으며, 동 행정복지센터와 평생학습 기관이 함께 참여한다. 유성구는 앞으로도 교육 접근성을 높이고 주민 주도의 학습 공동체를 활성화해 지속 가능한 평생학습 도시 기반을 강화할 계획이다. 또한 교육 사각지대에 놓인 주민이 가까운 곳에서 학습 상담과 맞춤형 강좌를 받을 수 있도록 관계 기관과 협력하고, 프로그램 운영 결과를 바탕으로 다음 과정의 품질을 지속적으로 개선할 방침이다.</td></tr>
</table>
`;

describe("yuseong-eminwon parseListItems", () => {
  it("정찰 패턴 — newsEpctNo, 제목, 부서, 등록일을 추출한다", () => {
    const items = parseListItems(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      newsEpctNo: "928",
      title: "유성구, 평생학습 분위기 확산",
      department: "교육과학과",
      publishedDate: "2014-03-12",
    });
  });
});

describe("yuseong-eminwon parseDetailBody", () => {
  it("td 안 가장 긴 한국어 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("평생학습");
  });
});
