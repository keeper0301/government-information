// boseong parser 회귀 방어. 보성군청 공식 보도자료의
// photonews 목록과 photo_view 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/boseong";

const MOCK_LIST_HTML = `
<ul class="photonews_top group">
  <li>
    <a href="/www/open_administration/city_news/press_release?idx=1158999&amp;mode=view">
      <img src="/build/images/example.jpg" alt="재부산보성군향우회 김인평 회장이 고향사랑기부금 300만 원을 보성군에 기탁하며 고향 사랑을 실천했다.">
      <div class="photonews_oppacity">
        <div class="title">
          <span>2026-07-21</span><p>재부산보성군향우회 김인평 회장, 고향사랑기부금 300만 원 기탁</p>
        </div>
      </div>
    </a>
  </li>
</ul>
<div class="photonews_cont">
  <p class="img"><a href="/www/open_administration/city_news/press_release?idx=1158997&amp;mode=view"><img src="/img.jpg" alt="휴양림 전경"></a></p>
  <dl>
    <dt class="title">
      <span class="span_tit"><a href="/www/open_administration/city_news/press_release?idx=1158997&amp;mode=view" title="보성군, 제암산자연휴양림 뜨거운 여름에도 시원하다(산림산업과) 에 대한 글내용 보기.">보성군, 제암산자연휴양림 뜨거운 여름에도 시원하다(산림산업과)<span class="icon_new">새로운글</span></a></span>
      <span class="span_date">2026-07-21</span>
    </dt>
  </dl>
</div>
`;

const MOCK_DETAIL_HTML = `
<head>
  <meta property="og:title" content="재부산보성군향우회 김인평 회장, 고향사랑기부금 300만 원 기탁">
</head>
<div class="photo_view">
  <span>작성일 2026.07.21 17:06</span>
  <div class="board_cont">
    <div class="photo_view">
      <img src="/build/images/example.jpg" alt="재부산보성군향우회 김인평 회장이 고향사랑기부금 300만 원을 보성군에 기탁하며 고향 사랑을 실천했다.">
    </div>
    <p>
      재부산보성군향우회 김인평 회장, 고향사랑기부금 300만 원 기탁<br>
      누적 900만 원 기부와 정기 후원까지 이어지는 변함없는 애향심을 실천했다.<br>
      보성군은 재부산보성군향우회 김인평 회장이 고향사랑기부금 300만 원을 기탁하며 고향 사랑을 실천했다고 밝혔다.<br>
      김 회장은 고향사랑기부제 시행 첫해부터 꾸준히 기부를 이어왔으며, 지역사회 발전과 주민 복지 증진을 위한 나눔도 지속하고 있다.<br>
      군은 고향사랑기금을 활용해 청년 지원과 주민 복리 증진, 문화·복지사업 등 다양한 기금사업을 추진하고 있다.
    </p>
    <a>목록</a> 본 저작물은 공공누리 안내입니다.
  </div>
</div>
`;

describe("boseong parseListPage", () => {
  it("보도자료 목록에서 idx, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "1158999",
      title: "재부산보성군향우회 김인평 회장, 고향사랑기부금 300만 원 기탁",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.boseong.go.kr/www/open_administration/city_news/press_release?idx=1158999&mode=view",
    });
    expect(items[1].title).toContain("제암산자연휴양림");
  });
});

describe("boseong parseDetailBody", () => {
  it("photo_view 상세 본문과 작성일을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-21");
    expect(body).toContain("고향사랑기부금 300만 원");
  });
});
