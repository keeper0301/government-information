// sunchang parser 회귀 방어. 순창군청 공식 보도자료의
// gallery_list 목록과 view_con 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/sunchang";

const MOCK_LIST_HTML = `
<div class="gallery_list imgtop">
  <ul class="list_4vs4 flex">
    <li>
      <a href="/board/post/view.do?boardUid=ff8080819a2f0e3b019a71a46284217a&amp;menuUid=ff8080819a2f0e3b019a5d1bb7da1652&amp;postUid=4028a6f09f4b44cb019f7fc18b470ab5">
        <dl class="gl_info">
          <dt><strong>전북은행 순창지점, 보건위생용품 100박스 기탁</strong></dt>
          <dd class="con">전북은행 순창지점은 지역 내 취약계층 여성청소년을 위해 보건위생용품을 기탁했다.</dd>
          <dd class="date"><span class="hidden">담당부서 :</span> 주민복지과 희망복지팀</dd>
          <dd class="date"><span class="hidden">작성일 :</span> <i class="icon-date"></i> 2026-07-20</dd>
        </dl>
      </a>
    </li>
  </ul>
</div>
`;

const MOCK_DETAIL_HTML = `
<div id="boardWrap">
  <div class="view_table">
    <p class="title"><strong>전북은행 순창지점, 보건위생용품 100박스 기탁</strong></p>
    <ul class="info_list">
      <li><strong>작성일</strong><span>2026-07-20</span></li>
    </ul>
    <div class="view_con">
      <p class="img"><img src="/tmp.jpg" alt="" /></p>
      <p>전북은행 순창지점은 지난 13일 지역 내 취약계층 여성청소년의 건강한 성장과 복지 증진을 위해 보건위생용품 100박스를 순창군에 기탁했다.</p>
      <p>전달된 선물박스는 여성청소년의 건강과 위생관리를 위한 생활용품으로 구성됐으며, 지역사회 나눔과 복지안전망 구축에 의미가 있다.</p>
      <p>군은 소중한 후원 물품이 필요한 청소년들에게 잘 전달될 수 있도록 하고 앞으로도 지역사회와 함께 촘촘한 복지안전망을 구축하겠다고 밝혔다.</p>
    </div>
    <div class="file_box"></div>
  </div>
</div>
`;

describe("sunchang parseListPage", () => {
  it("보도자료 목록에서 postUid, 제목, 작성일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "4028a6f09f4b44cb019f7fc18b470ab5",
      title: "전북은행 순창지점, 보건위생용품 100박스 기탁",
      publishedDate: "2026-07-20",
      sourceUrl:
        "https://www.sunchang.go.kr/board/post/view.do?boardUid=ff8080819a2f0e3b019a71a46284217a&menuUid=ff8080819a2f0e3b019a5d1bb7da1652&postUid=4028a6f09f4b44cb019f7fc18b470ab5",
    });
  });
});

describe("sunchang parseDetailBody", () => {
  it("view_con 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-20");
    expect(body).toContain("보건위생용품 100박스");
  });
});
