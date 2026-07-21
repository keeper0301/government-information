// seocheon parser 회귀 방어. 서천군청 공식 보도자료의
// data-ntt-id 카드 목록과 div_speller_content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/seocheon";

const MOCK_LIST_HTML = `
<div class="item item--bodo">
  <button type="button" class="bbs__list__link btn-view" data-ntt-id="B000000201292Ho1fS6">
    <div class="bbs__head">
      <strong class="bbs__title">유승광 서천군수, 주요 유관기관 방문…소통·협력 행정 시동</strong>
    </div>
    <div class="bbs__texts">
      <p>유승광 서천군수, 주요 유관기관 방문소통·협력 행정 시동</p>
    </div>
    <span class="bbs__date">2026. 07. 15.</span>
  </button>
</div>
`;

const MOCK_DETAIL_HTML = `
<div class="ui board-view__header">
  <h2 class="ui board-view__title">유승광 서천군수, 주요 유관기관 방문…소통·협력 행정 시동</h2>
  <span class="board-view__info-item info__date"><i class="board__icon board__icon--regDate">등록일</i>2026-07-15</span>
</div>
<div class="board-view__contents" data-text-content="true">
  <div class="board-view__contents-inner">
    <div class="bbs-thumb-photo"><img src="photo.jpg" alt="사진 이미지" /></div>
    <div class="div_speller_content">
      <p>유승광 서천군수가 취임 후 지역 주요 유관기관을 잇달아 방문하며 민선9기 군정의 성공적인 출발을 위한 소통·협력 행보에 나섰다.</p>
      <p>유 군수는 지난 13일 대한노인회 서천군지회를 시작으로 서천경찰서, 서천소방서, 서천교육지원청, 서천문화원을 차례로 방문해 취임 인사를 전하고 군민 안전과 복지, 교육·문화 발전을 위한 협력 방안을 논의했다.</p>
      <p>이번 방문은 지역사회 각 분야의 핵심 기관과 긴밀한 협력 네트워크를 구축하고, 현장의 다양한 의견을 군정에 반영해 군민이 체감할 수 있는 변화를 만들어가기 위해 마련됐다.</p>
      <p>서천군은 앞으로도 지역 주요 기관과의 공조체계를 강화해 각종 지역 현안에 공동 대응하고 군민에게 더욱 수준 높은 행정서비스를 제공할 계획이다.</p>
    </div>
  </div>
</div>
`;

describe("seocheon parseListPage", () => {
  it("data-ntt-id 카드에서 제목과 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "B000000201292Ho1fS6",
      title: "유승광 서천군수, 주요 유관기관 방문…소통·협력 행정 시동",
      publishedDate: "2026-07-15",
      sourceUrl:
        "https://www.seocheon.go.kr/bbs/BBSMSTR_000000000270/view.do?nttId=B000000201292Ho1fS6",
    });
  });
});

describe("seocheon parseDetailBody", () => {
  it("div_speller_content 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("민선9기 군정");
    expect(body).toContain("2026-07-15");
  });
});
