// yeongam parser 회귀 방어. 영암군청 공식 보도자료의
// board_photonews 목록과 show_info 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/yeongam";

const MOCK_LIST_HTML = `
<dl class="board_photonews">
  <dt><a href="/home/www/open_information/yeongam_news/bodo/show/9rcekgcuxn44po5vb46v"><img src="/module/wsboard/data/www_bodo/sample.jpg" alt="영암군, 청년정책 파트너 ‘제4기 청년협의체’ 출범" /></a></dt>
  <dd><a href="/home/www/open_information/yeongam_news/bodo/show/9rcekgcuxn44po5vb46v">
    <span class="title ">영암군, 청년정책 파트너 ‘제4기 청년협의체’ 출범<img src="/images/board/new.gif" alt="새로운글" /></span></a>
    <span class="memo">- 청년 26명 위촉, 4개 분과에서 청년 의견 수렴·정책 제안 활동 -<br>영암군이 청년들과 함께 정책을 만들어갈 협의체를 출범했다.</span>
    <span class="date"> (이용우 / 2026-07-22 14:52)</span>
  </dd>
  <dd class="clearboth">&nbsp;</dd>
</dl>
`;

const MOCK_DETAIL_HTML = `
<div id="content">
  <div class="show_info">
    <h3>영암군, 청년정책 파트너 ‘제4기 청년협의체’ 출범</h3>
    <div class="reg_info">2026-07-22<span style="float:right">조회수 : 18</span></div>
    <div class="con_detail">
      <div id="img_control" class="img_control">
        <img src="/module/wsboard/data/www_bodo/sample.jpg" alt="영암군, 청년정책 파트너 이미지 1" />
      </div>
      <span>- 청년 26명 위촉, 4개 분과에서 청년 의견 수렴·정책 제안 활동 -<br>
      <br>
      영암군(군수 우승희)이 청년들과 함께 정책을 만들어갈 제4기 청년협의체를 출범했다.<br>
      <br>
      군은 지난 20일 달빛청춘마루에서 제4기 청년협의체 위촉식을 열고, 공개모집으로 선발한 19세부터 49세까지 청년 26명에게 위촉장을 수여했다.<br>
      <br>
      청년협의체는 앞으로 2년 동안 창업·일자리, 복지·문화, 소통·참여, 농업 등 4개 분과에서 활동하며 청년들의 의견을 모아 군에 전달하고, 지역에 필요한 청년정책을 제안한다.<br>
      <br>
      우승희 영암군수는 청년정책은 행정이 만드는 것이 아니라 청년이 함께 만드는 것이라며 현장의 목소리를 정책에 반영하겠다고 말했다.</span>
    </div>
  </div>
  <div class='codeView04'>공공누리</div>
</div>
`;

describe("yeongam parseListPage", () => {
  it("보도자료 목록에서 slug, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "9rcekgcuxn44po5vb46v",
      title: "영암군, 청년정책 파트너 ‘제4기 청년협의체’ 출범",
      publishedDate: "2026-07-22",
      sourceUrl:
        "https://www.yeongam.go.kr/home/www/open_information/yeongam_news/bodo/show/9rcekgcuxn44po5vb46v",
    });
  });
});

describe("yeongam parseDetailBody", () => {
  it("상세 제목, 작성일, 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("영암군, 청년정책 파트너");
    expect(body).toContain("청년협의체는 앞으로 2년 동안");
    expect(body).toContain("2026-07-22");
  });
});
