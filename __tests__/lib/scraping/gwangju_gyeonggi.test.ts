// gwangju_gyeonggi parser 회귀 방어. 경기도 광주시청 공식 보도자료의
// YH portal/bbs 목록과 bod_view 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/gwangju_gyeonggi";

const MOCK_LIST_HTML = `
<table class="bod_list">
  <tbody>
    <tr>
      <td class="list_num">18509</td>
      <td class="list_tit">
        <a href="#" onclick="goTo.view('list','346105','22','0203010000'); return false;">
          광주시장애인가족지원센터, 장애인 가족 대상 "아빠와 함께하는 워터파크" 가족 캠프 운영
          <span class="ico_new"><span class="blind">새 글</span></span>
        </a>
      </td>
      <td class="list_file"><img src="/common/img/board/jpg.gif" alt="jpg 파일"/></td>
      <td class="list_date">2026-07-23</td>
      <td class="list_hit">30</td>
    </tr>
    <tr>
      <td class="list_num">18508</td>
      <td class="list_tit">
        <a href="#" onclick="goTo.view('list','346104','22','0203010000'); return false;">
          광주시, 자활근로 사업단 &quot;국수나무&quot;·업사이클링 공방 &quot;다시, 봄&quot; 개소
        </a>
      </td>
      <td class="list_file"><img src="/common/img/board/jpg.gif" alt="jpg 파일"/></td>
      <td class="list_date">2026-07-23</td>
      <td class="list_hit">19</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<div class="bod_wrap">
  <div class="bod_view">
    <h4>광주시장애인가족지원센터, 장애인 가족 대상 "아빠와 함께하는 워터파크" 가족 캠프 운영</h4>
    <div class="view_info">
      <ul class="clFix">
        <li class="view_date"><span>등록일</span> 2026-07-23</li>
        <li class="view_hit"><span>조회</span> 32</li>
      </ul>
    </div>
    <div class="view_cont ">
      <img src="/common/file/img/view.do?atchFileId=example&amp;fileSn=example" alt="사진 파일"/>
      <div class="mT10">
        광주시장애인가족지원센터는 지난 17일 제헌절을 맞아 광주시에 거주하는 장애인가족 70명을 대상으로 캐리비안베이에서 ‘아빠와 함께하는 워터파크!’ 가족 캠프를 운영했다.<br><br>
        이번 가족캠프는 장애인 가족의 여가활동 기회를 확대하고 아버지의 가족 돌봄 참여를 높이기 위해 마련됐다.<br><br>
        센터는 가족이 양육과 돌봄 과정에서 겪는 부담을 함께 나누고 가족 구성원이 일상에서 벗어나 함께 여가를 즐길 수 있는 시간을 제공하고자 프로그램을 마련했다.<br><br>
        참여 가족들은 워터파크 내 다양한 물놀이 시설을 이용하며 가족 단위의 여가활동을 즐겼다.<br><br>
        아버지들은 자녀와 함께 물놀이에 참여하며 돌봄에 함께했고 가족들은 정서적 휴식과 가족 간 유대감을 다지는 시간을 보냈다.<br><br>
        앞으로도 장애인 가족의 양육 부담을 완화하고 가족 모두가 함께 참여할 수 있는 프로그램을 지속적으로 운영하겠다고 밝혔다.<br><br>
        &nbsp;&nbsp;※ 본 게시물은 자동화로봇에 의해 등록되었습니다.
      </div>
    </div>
    <dl class="view_file clFix"><dt><span>첨부 파일</span></dt><dd>파일명.jpg</dd></dl>
  </div>
</div>
`;

describe("gwangju_gyeonggi parseListPage", () => {
  it("goTo.view onclick 행에서 bIdx, 제목, 작성일, 상세 URL을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "346105",
      title:
        '광주시장애인가족지원센터, 장애인 가족 대상 "아빠와 함께하는 워터파크" 가족 캠프 운영',
      publishedDate: "2026-07-23",
      sourceUrl:
        "https://www.gjcity.go.kr/portal/bbs/view.do?mId=0203010000&bIdx=346105&ptIdx=22",
    });
    expect(items[1]).toMatchObject({
      seq: "346104",
      title: '광주시, 자활근로 사업단 "국수나무"·업사이클링 공방 "다시, 봄" 개소',
    });
  });
});

describe("gwangju_gyeonggi parseDetailBody", () => {
  it("bod_view 제목과 view_cont 본문을 추출하고 파일/로봇 고지를 제외한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("광주시장애인가족지원센터");
    expect(body).toContain("여가활동 기회를 확대");
    expect(body).not.toContain("파일명.jpg");
    expect(body).not.toContain("자동화로봇");
  });
});
