// hwasun parser 회귀 방어. 화순군청 공식 보도자료의
// gallery 목록과 boViewcont 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/hwasun";

const MOCK_LIST_HTML = `
<div class="gallery">
  <ul>
    <li>
      <dl>
        <dt>
          <a href="/gallery.do?S=S01&amp;M=020101000000&amp;b_code=0000000001&amp;v_type=SK3&amp;b_list=10&amp;act=view&amp;list_no=20786&amp;nPage=1&amp;vlist_no_npage=1&amp;keyField=&amp;keyWord=&amp;orderby=REG_DATE&amp;cg_code=제4유형" title="화순군, 군수 직속 군민 소통방 운영 추진">
            <img src="/upfiles/gallery/0000000001/L_0000000001_20260722113015_0.jpg" alt="화순군, 군수 직속 군민 소통방 운영 추진" />
          </a>
        </dt>
        <dd>
          <a href="/gallery.do?S=S01&amp;M=020101000000&amp;b_code=0000000001&amp;v_type=SK3&amp;b_list=10&amp;act=view&amp;list_no=20786&amp;nPage=1&amp;vlist_no_npage=1&amp;keyField=&amp;keyWord=&amp;orderby=REG_DATE&amp;cg_code=제4유형" title="화순군, 군수 직속 군민 소통방 운영 추진">
            <p><strong>화순군, 군수 직속 군민 소통방 운영 추진</strong><br />&nbsp;&nbsp;</p>
            <span>화순군, 군수 직속 군민 소통방 운영 추진‘군민 중심의 열린 소통행정 본격 추진’ 화순군은 군민 중심의 열린 소통 행정 실현을 위해 군수 직속 군민 소통방을 운영한다고 밝혔다.</span>
          </a>
          <small>2026-07-22</small>
        </dd>
      </dl>
    </li>
  </ul>
</div>
`;

const MOCK_DETAIL_HTML = `
<div class="boardR">
  <p class="boViewtitle">화순군, 군수 직속 군민 소통방 운영 추진</p>
  <ul>
    <li class="boViewunit"><span>담당부서 : 자치행정과 행정팀</span>등록일 : 2026-07-22<span></span>조회수 : 32</li>
    <li class="boViewcont">
      <p class="C"><img src="/upfiles/gallery/0000000001/0000000001_20260722113015_0.jpg" alt="화순군, 군수 직속 군민 소통방 운영 추진 1" /></p>
      <div class='ga_vew_cont'>
        화순군, 군수 직속 군민 소통방 운영 추진<br/>
        ‘군민 중심의 열린 소통행정 본격 추진’<br/>
        화순군은 군민 중심의 열린 소통 행정 실현을 위해 군수 직속 군민 소통방을 7월 22일부터 시범 운영한다고 밝혔다.<br/>
        소통방은 참여와 소통을 기반으로 한 군민 주권 시대 실현이라는 군정 운영 방향에 따라 기존 군수 접견실을 군민 중심의 열린 공간으로 새롭게 조성한 것이다.<br/>
        방문객의 심리적 문턱을 낮추고 인터넷 이용이 어려운 고령층과 디지털 취약계층의 행정 접근성을 높이기 위해 추진됐다.<br/>
        군은 군민의 생활 불편 사항과 정책 제안을 상시 접수하고 처리 결과 또는 향후 계획을 안내할 예정이다.
      </div>
    </li>
  </ul>
</div>
`;

describe("hwasun parseListPage", () => {
  it("보도자료 목록에서 list_no, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "20786",
      title: "화순군, 군수 직속 군민 소통방 운영 추진",
      publishedDate: "2026-07-22",
      sourceUrl:
        "https://www.hwasun.go.kr/gallery.do?S=S01&M=020101000000&b_code=0000000001&v_type=SK3&b_list=10&act=view&list_no=20786&nPage=1&vlist_no_npage=1&keyField=&keyWord=&orderby=REG_DATE&cg_code=%EC%A0%9C4%EC%9C%A0%ED%98%95",
    });
  });
});

describe("hwasun parseDetailBody", () => {
  it("boViewcont 상세 본문과 등록일을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("2026-07-22");
    expect(body).toContain("군민 중심의 열린 소통행정");
  });
});
