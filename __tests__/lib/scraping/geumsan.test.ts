// geumsan parser 회귀 방어. 금산군 금산홍보관 공식 보도자료의
// nes_dta_key 목록과 ui bbs--view--content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/geumsan";

const MOCK_LIST_HTML = `
<a href="?mode=V&amp;nes_dta_key=597d1d9164d3a6c0874a63c2314e8ef3">
  금산군 금성면 파초리 해바라기꽃 활짝
  금산군 금성면 파초리 해바라기꽃 활짝 금성면행정복지센터 직원들이 꽃밭 조성
  작성자 기획예산과 등록일 2026-07-14
</a>
`;

const MOCK_DETAIL_HTML = `
<h2 class="ui bbs--view--tit">금산군 금성면 파초리 해바라기꽃 활짝</h2>
<span class="inq_cnt"><i>등록일</i>2026-07-14 </span>
<div class="ui bbs--view--content">
  금산군 금성면 파초리 해바라기꽃 활짝<br />
  금성면행정복지센터 직원들이 꽃밭 조성<br />
  금산군 금성면 파초리 일원에 해바라기꽃이 개화했다.<br />
  이 꽃밭은 467㎡ 규모로 금성면행정복지센터 직원들이 조성해 의미를 더했다.<br />
  금성면 관계자는 주민들과 관광객들께 지역의 좋은 모습을 보여드리기 위해 만든 꽃밭에 해바라기꽃들이 피어났다며 바쁜 일상에서 아름다운 꽃을 보시며 마음의 여유를 잠시 가져보시길 바란다고 말했다.<br />
  현장에서는 주민들이 꽃밭 주변 환경을 함께 살피고 방문객 안내 동선을 정비하는 등 마을 경관 개선을 위한 노력을 이어가고 있다.<br />
  금산군은 앞으로도 지역 특색을 살린 작은 경관 사업을 통해 주민 만족도를 높이고 방문객에게 쾌적한 이미지를 제공할 계획이다.<br />
  &lt;사진&gt; 금산군 금성면 파초리 해바라기꽃
</div>
`;

describe("geumsan parseListPage", () => {
  it("nes_dta_key 목록 링크에서 제목과 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "597d1d9164d3a6c0874a63c2314e8ef3",
      title: "금산군 금성면 파초리 해바라기꽃 활짝",
      publishedDate: "2026-07-14",
      sourceUrl:
        "https://www.geumsan.go.kr/media/html/sub01/0102.html?mode=V&nes_dta_key=597d1d9164d3a6c0874a63c2314e8ef3",
    });
  });
});

describe("geumsan parseDetailBody", () => {
  it("ui bbs--view--content 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("해바라기꽃");
    expect(body).toContain("2026-07-14");
  });
});
