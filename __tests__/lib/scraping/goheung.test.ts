// goheung parser 회귀 방어. 고흥군청 공식 보도자료의
// siiruBoard-gallery2 목록과 bd_view_cont 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/goheung";

const MOCK_LIST_HTML = `
<div class="siiruBoard-gallery2">
  <ul class="board_list board_type_b">
    <li>
      <div class="box">
        <a href="/boardView.do?pageId=www102&amp;boardId=BD_00025&amp;seq=3621318&amp;movePage=1">
          <img src="/imageView/example" class="img_box" alt="고흥군, 농산물 스마트 공급센터 준공... 산지 유통 혁신 포문 열다">
        </a>
      </div>
      <dl>
        <dt class="new">
          <a href="/boardView.do?pageId=www102&amp;boardId=BD_00025&amp;seq=3621318&amp;movePage=1" data-view="G" data-seq="3621318">
            고흥군, 농산물 스마트 공급센터 준공... 산지 유통 ...
          </a>
        </dt>
        <dd><span>농업정책과(스마트유통)</span><span>2026-07-21</span></dd>
      </dl>
    </li>
  </ul>
</div>
`;

const MOCK_DETAIL_HTML = `
<head>
  <meta property="og:title" content="고흥군, 농산물 스마트 공급센터 준공... 산지 유통 혁신 포문 열다">
</head>
<div class="bd_view_cont">
  <div class="view_img">
    <img src="/imageView/example" alt="고흥군, 농산물 스마트 공급센터 준공... 산지 유통 혁신 포문 열다">
  </div>
  <p>
    고흥군은 지역 농산물의 수급 조절과 산지 유통 경쟁력 강화를 위한 농산물 스마트 공급센터 준공식을 개최하고 본격적인 운영에 들어갔다고 밝혔다.<br>
    이날 준공식은 풍물놀이 식전공연을 시작으로 개식, 경과보고, 기념사, 참여농가 답사, 축사, 기념 색줄 자르기와 시설 시찰 순으로 진행됐다.<br>
    센터 1층에는 고품질 농산물 출하를 위한 스마트 공동 선별장, 소포장실, 저온 냉장창고, 위생검수실을 갖춰 농산물의 안전성과 상품성을 높였다.<br>
    군은 앞으로 토마토 재배 농가와 연계해 공동 선별·출하 시스템을 본격적으로 가동하고 안정적인 운영 관리와 농가 지원에 역량을 집중하겠다고 말했다.
  </p>
  <div class="siiruBoardBody2">공공누리 안내</div>
</div>
<div class="bd_view_list"><ul><li>이전글</li></ul></div>
`;

describe("goheung parseListPage", () => {
  it("보도자료 카드 목록에서 seq, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "3621318",
      title: "고흥군, 농산물 스마트 공급센터 준공... 산지 유통 혁신 포문 열다",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.goheung.go.kr/boardView.do?pageId=www102&boardId=BD_00025&seq=3621318&movePage=1",
    });
  });
});

describe("goheung parseDetailBody", () => {
  it("bd_view_cont 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("농산물 스마트 공급센터");
    expect(body).toContain("공동 선별·출하 시스템");
  });
});
