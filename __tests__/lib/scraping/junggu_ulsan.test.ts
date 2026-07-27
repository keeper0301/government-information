// junggu_ulsan parser 회귀 방어. 울산 중구 보도자료의
// RFC3 press_list card + board_view detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/junggu_ulsan";

const LIST_HTML = `
<div class="press_list">
  <ul>
    <li>
      <div class="item ">
        <a href="/board/view.ulsan?boardId=BBS_0000090&amp;menuCd=DOM_000000102003002000&amp;orderBy=TMP_FIELD4 DESC,REGISTER_DATE DESC&amp;paging=ok&amp;startPage=1&amp;dataSid=724490" class="thumb">
          <img src="/upload_data/board_data/BBS_0000090/thumbnail/178514098558523.jpg" alt="성안동-성안파출소-성안 안전마을만들기협의회, ‘안전마을 만들기 사업’ 업무협약 체결" />
        </a>
        <dl>
          <dt class="subject">
            <a href="/board/view.ulsan?boardId=BBS_0000090&amp;menuCd=DOM_000000102003002000&amp;orderBy=TMP_FIELD4 DESC,REGISTER_DATE DESC&amp;paging=ok&amp;startPage=1&amp;dataSid=724490">성안동-성안파출소-성안 안전마을만들기협의회, ‘안전마을 만들기 사업’ 업무협약 체결</a>
          </dt>
          <dd class="pt">울산 중구 성안동 행정복지센터와 성안파출소가 업무협약을 맺었다.</dd>
          <dd class="opt">
            <span>담당부서 : 성안동</span>
            <span>조회 : 5</span>
            <span>작성일 : 2026-07-27</span>
          </dd>
        </dl>
      </div>
    </li>
  </ul>
</div>
`;

const DETAIL_HTML = `
<div class="board_view">
  <h4 class="subject">성안동-성안파출소-성안 안전마을만들기협의회, ‘안전마을 만들기 사업’ 업무협약 체결</h4>
  <ul class="view_info">
    <li><span>담당부서</span> 성안동</li>
    <li><span>작성일</span> 2026-07-27</li>
    <li><span>조회수</span> 6</li>
  </ul>
  <div class="view_file">
    <span>파일</span>
    <ul><li><a href="/board/download.ulsan?boardId=BBS_0000090&amp;dataSid=724490&amp;fileSid=278200" title="성안동 업무협약 사진 첨부파일 다운로드">사진.jpg</a></li></ul>
  </div>
  <div class="b_con">
    <div class="bbs_image">
      <img src="/upload_data/board_data/BBS_0000090/178514098558523.jpg" alt="성안동-성안파출소-성안 안전마을만들기협의회, 안전마을 만들기 사업 업무협약 체결" />
    </div>
    <div class="bbs_detail">
      울산 중구 성안동 행정복지센터와 성안파출소, 성안동 안전마을만들기 협의회가
      27일 성안동 행정복지센터 회의실에서 2026년 성안동 안전마을 만들기 사업 운영을 위한
      업무협약을 맺었다. 이번 협약은 주민이 안심하고 생활할 수 있는 마을 환경을 조성하기 위해
      기관별 역할을 나누고 범죄예방 활동, 취약지역 점검, 주민 참여 캠페인을 함께 추진하는 내용을 담고 있다.
    </div>
  </div>
</div>
`;

describe("junggu_ulsan parsers", () => {
  it("parses RFC3 press_list cards", () => {
    const items = parseListItems(LIST_HTML);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "724490",
      title: "성안동-성안파출소-성안 안전마을만들기협의회, ‘안전마을 만들기 사업’ 업무협약 체결",
      publishedDate: "2026-07-27",
    });
    expect(items[0]?.sourceUrl).toContain("/board/view.ulsan?");
    expect(items[0]?.sourceUrl).toContain("boardId=BBS_0000090");
    expect(items[0]?.sourceUrl).toContain("dataSid=724490");
    expect(items[0]?.sourceUrl).toContain("menuCd=DOM_000000102003002000");
  });

  it("parses board_view detail body", () => {
    const body = parseDetailBody(DETAIL_HTML);
    expect(body).toContain("성안동 안전마을 만들기 사업");
    expect(body).toContain("취약지역 점검");
    expect(body?.length).toBeGreaterThan(250);
  });
});
