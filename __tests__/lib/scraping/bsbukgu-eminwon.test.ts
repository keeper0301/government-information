// bsbukgu-eminwon parser 회귀 방어. 공통 로직은 _eminwon_helper(기장과 공유)지만
// 북구 실제 정찰 HTML 패턴(미래전략과·searchDetail)으로 re-export 동작 검증.

import { describe, it, expect } from "vitest";
import {
  parseListItems,
  parseDetailBody,
} from "@/lib/scraping/local-press/bsbukgu-eminwon";

// 2026-06-01 라이브 정찰 패턴: tr 안 번호/제목/부서/등록일/조회수 + searchDetail('N').
const MOCK_LIST_HTML = `
<table>
  <tr><th>번호</th><th>제목</th><th>부서</th><th>등록일</th></tr>
  <tr>
    <td>11732</td>
    <td><a href="#" onclick="javascript:searchDetail('11809')">부산 북구 만덕2동, 마을안심길 굴다리 일원 상습 불결지 환경정비 추진</a></td>
    <td>미래전략과</td>
    <td>2026-05-22</td>
    <td>8</td>
  </tr>
  <tr>
    <td>11731</td>
    <td><a href="#" onclick="javascript:searchDetail('11808')">부산 북구 금곡동 청년회, 지역 어르신 대상 무료급식 봉사 펼쳐</a></td>
    <td>미래전략과</td>
    <td>2026-05-22</td>
    <td>0</td>
  </tr>
</table>
`;

const MOCK_DETAIL_HTML = `
<table>
  <tr><td>제목</td><td>부산 북구 만덕2동, 마을안심길 환경정비 추진</td></tr>
  <tr><td>내용</td><td>부산 북구(구청장)는 만덕2동 마을안심길 굴다리 일원의 상습 불결지에 대한 환경정비를 추진한다고 밝혔다. 이번 정비는 주민들이 안심하고 다닐 수 있는 보행환경을 조성하기 위한 것으로, 굴다리 주변 쓰레기 무단투기 근절과 조명 개선, 벽화 조성 등을 통해 어둡고 음침했던 공간을 밝고 안전한 거리로 탈바꿈시킬 계획이다. 북구는 앞으로도 주민 생활과 밀접한 생활환경 개선 사업을 지속적으로 추진해 군민이 체감할 수 있는 깨끗하고 안전한 마을을 만드는 데 행정력을 집중할 방침이다.</td></tr>
</table>
`;

describe("bsbukgu-eminwon parseListItems", () => {
  it("정찰 패턴 — 2건 추출 (newsEpctNo + 제목 + 부서 + 등록일)", () => {
    const items = parseListItems(MOCK_LIST_HTML);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      newsEpctNo: "11809",
      department: "미래전략과",
      publishedDate: "2026-05-22",
    });
    expect(items[0].title).toContain("만덕2동");
  });

  it("searchDetail 없는 헤더 tr 은 skip", () => {
    expect(parseListItems(MOCK_LIST_HTML)).toHaveLength(2);
  });
});

describe("bsbukgu-eminwon parseDetailBody", () => {
  it("td 안 가장 긴 한국어 본문 추출 (≥250자)", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);
    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("만덕2동");
  });

  it("250자 미만 = null", () => {
    expect(parseDetailBody(`<td>짧은 본문.</td>`)).toBeNull();
  });
});
