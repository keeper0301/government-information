// gyeryong parser 회귀 방어. 계룡시청 공식 보도자료의
// mode=V&no 목록 링크와 ui bbs--view--content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/gyeryong";

const MOCK_LIST_HTML = `
<a href="?mode=V&amp;no=65cb18d8142b5734229ce34cc914a47b&amp;GotoPage=1">
  <strong class="title">계룡시, 민선9기 기관·단체 방문 시작…자율방재단과 첫 소통</strong>
  <li class="cont">충남 계룡시는 민선9기 출범을 맞아 추진하는 유관기관·단체 방문의 첫 일정으로 자율방재단을 찾았다.</li>
  <li class="writer"><b>작성자</b>시민소통담당관</li>
  <li class="regDate"><b>등록일</b>2026-07-03</li>
</a>
`;

const MOCK_DETAIL_HTML = `
<h2 class="ui bbs--view--tit">계룡시, 민선9기 기관·단체 방문 시작…자율방재단과 첫 소통</h2>
<div class="ui bbs--view--opt">
  <span class="inq_cnt"><i>등록일</i>2026.07.03</span>
</div>
<div class="ui bbs--view--content">
  <div>
    <p>충남 계룡시는 민선9기 출범을 맞아 추진하는 유관기관·단체 방문의 첫 일정으로 계룡시 자율방재단을 찾아 단원들과 소통하는 시간을 가졌다고 밝혔다.</p>
    <p>이번 방문은 민선9기 시정의 핵심 가치인 시민과의 소통을 바탕으로 현장 중심 행정을 실천하고 지역사회 각 분야에서 활동하는 기관·단체와 협력체계를 강화하기 위해 마련됐다.</p>
    <p>시는 기관별 주요 현안과 다양한 의견을 직접 듣고 이를 시정에 적극 반영해 시민이 체감하는 행정을 실현해 나갈 계획이다.</p>
    <p>이응우 시장은 자율방재단 관계자들과 간담회를 갖고 여름철 자연재난 대응 현황을 점검하는 한편 현장 활동 과정의 어려운 점과 건의사항을 청취했다.</p>
    <p>시는 앞으로도 자율방재단과 긴밀한 협력체계를 유지하며 시민이 안심하고 생활할 수 있는 안전한 도시 조성에 힘쓸 계획이다.</p>
  </div>
</div>
`;

describe("gyeryong parseListPage", () => {
  it("mode=V 목록 링크에서 hash id, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "65cb18d8142b5734229ce34cc914a47b",
      title: "계룡시, 민선9기 기관·단체 방문 시작…자율방재단과 첫 소통",
      publishedDate: "2026-07-03",
      sourceUrl:
        "https://www.gyeryong.go.kr/kr/html/sub03/030105.html?mode=V&no=65cb18d8142b5734229ce34cc914a47b&GotoPage=1",
    });
  });
});

describe("gyeryong parseDetailBody", () => {
  it("ui bbs--view--content 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("계룡시 자율방재단");
    expect(body).toContain("2026-07-03");
  });
});
