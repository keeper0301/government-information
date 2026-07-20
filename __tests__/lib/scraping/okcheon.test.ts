// okcheon parser 회귀 방어. 공식 옥천보도자료 게시판의
// media-gallery 목록과 p-table__content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/okcheon";

const MOCK_LIST_HTML = `
<li class="p-media">
  <a href="./selectBbsNttView.do?key=252&amp;bbsNo=44&amp;nttNo=192047&amp;searchCtgry=&amp;pageIndex=1" class="p-media__link">
    <div class="p-media__image"><span class="p-icon p-icon__new">새글</span></div>
    <div class="p-media__body">
      <div class="p-media__heading">
        <em class="p-media__heading-text">
          제16회 향수옥천 옥수수·감자축제 성황리 마무리… 6천여 명 찾아 지역 대표 여름축제 입증
        </em>
      </div>
      <div class="p-author__info">
        <span class="p-split">2026-07-20</span>
      </div>
    </div>
  </a>
</li>
`;

const MOCK_DETAIL_HTML = `
<table class="p-table block">
  <tbody class="p-table--th-left">
    <tr>
      <td colspan="2">
        <span class="p-table__subject_text">제16회 향수옥천 옥수수·감자축제 성황리 마무리</span>
      </td>
    </tr>
    <tr>
      <td colspan="2" title="내용" class="p-table__content">
        제16회 향수옥천 옥수수·감자축제가 지난 주말 성황리에 마무리됐다.<br />
        축제 기간 동안 옥천 지역 농가가 직접 생산한 옥수수와 감자를 활용한 판매장과 체험 프로그램이 운영됐고, 방문객들은 지역 농산물의 우수성을 체험했다.<br />
        군은 이번 축제를 통해 농산물 판로 확대와 지역 상권 활성화 효과를 확인했으며, 주민과 관광객이 함께 즐기는 대표 여름축제로 발전시켜 나갈 계획이라고 밝혔다.<br />
        관계자는 안전관리와 교통 안내에 협조한 주민과 자원봉사자에게 감사의 뜻을 전했다.
      </td>
    </tr>
  </tbody>
</table>
`;

describe("okcheon parseListPage", () => {
  it("media-gallery 목록에서 seq, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "192047",
      title:
        "제16회 향수옥천 옥수수·감자축제 성황리 마무리… 6천여 명 찾아 지역 대표 여름축제 입증",
      publishedDate: "2026-07-20",
      sourceUrl:
        "https://oc.go.kr/www/selectBbsNttView.do?key=252&bbsNo=44&nttNo=192047",
    });
  });
});

describe("okcheon parseDetailBody", () => {
  it("p-table__content 본문에서 한국어 전문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("향수옥천 옥수수·감자축제");
  });
});
