// jecheon parser 회귀 방어. 공식 오늘의 뉴스 게시판의
// media-card 목록과 bbs_content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/jecheon";

const MOCK_LIST_HTML = `
<li class="p-media">
  <div class="p-media__body">
    <div class="p-media__heading p-media__heading--ellipsis">
      <a href="./selectBbsNttView.do?key=112&amp;id=&amp;&amp;bbsNo=287&amp;nttNo=401747&amp;pageIndex=1" class="p-media__link">
        <em class="p-media__heading-text">
          신백동지역사회보장협의체, ‘새 학기 희망 스타트’특화사업 추진
          <span class="p-icon p-icon__new">새글</span>
        </em>
      </a>
    </div>
    <div class="p-author__info">
      <span class="p-split"><em class="skip">작성일 :</em><span class="time">2026.07.19</span></span>
    </div>
    <div class="p-media__content">신백동지역사회보장협의체는 청소년 가구에 문화상품권을 지원했다.</div>
  </div>
</li>
`;

const MOCK_DETAIL_HTML = `
<table class="p-table block">
  <tbody class="p-table--th-left">
    <tr><th scope="row">제목</th><td scope="row">신백동지역사회보장협의체, 새 학기 희망 스타트 특화사업 추진</td></tr>
    <td colspan="2" title="내용" class="bbs_content">
      신백동지역사회보장협의체는 지난 14일 2학기를 앞두고 새 학기 희망스타트 특화사업을 통해 관내 저소득 청소년 가구에 문화상품권을 지원했다.<br />
      이번 사업은 경제적 부담으로 학습 준비에 어려움을 겪는 학생들이 새 학기를 안정적으로 시작할 수 있도록 돕기 위해 마련됐다.<br />
      협의체는 지역 내 복지 사각지대를 발굴하고 맞춤형 복지 서비스를 제공하기 위해 지속적으로 민관 협력 사업을 추진하고 있다.<br />
      관계자는 앞으로도 아동과 청소년이 건강하게 성장할 수 있도록 다양한 지원 사업을 이어가겠다고 밝혔다.
    </td>
  </tbody>
</table>
`;

describe("jecheon parseListPage", () => {
  it("media-card 목록에서 seq, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "401747",
      title: "신백동지역사회보장협의체, ‘새 학기 희망 스타트’특화사업 추진",
      publishedDate: "2026-07-19",
      sourceUrl:
        "https://www.jecheon.go.kr/www/selectBbsNttView.do?key=112&bbsNo=287&nttNo=401747",
    });
  });
});

describe("jecheon parseDetailBody", () => {
  it("bbs_content 본문에서 한국어 전문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("희망스타트");
  });
});
