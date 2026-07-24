// pocheon parser 회귀 방어. 포천시청 공식 보도자료의
// KRDS p-media 목록과 contenttext 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/pocheon";

describe("pocheon local press parser", () => {
  it("p-media 목록에서 id/title/date/sourceUrl을 추출한다", () => {
    const html = `
      <ul class="p-media-list p-media--ellipsis margin_t_5">
        <li class="p-media">
          <div class="p-media__link" style="width:100%;">
            <div class="p-media__body">
              <div class="p-media__heading p-media__heading--ellipsis">
                <em class="p-media__heading-date">2026-07-23</em>
              </div>
              <a href="./selectBbsNttView.do?bbsNo=5014&amp;nttNo=801272&amp;key=3731&amp;pageUnit=10&amp;pageIndex=1" class="p-media__content">
                <em class="p-media__subject">
                  포천시정신건강복지센터-포천교육지원청, 2026년 아동·청소년 정신건강 캠페인 공개강좌 성료
                  <span class="p-icon p-icon__new">새글</span>
                </em>
                <span class="p-media__context">포천시정신건강복지센터는 공개강좌를 성황리에 개최했다.</span>
              </a>
            </div>
          </div>
        </li>
        <li class="p-media">
          <div class="p-media__heading p-media__heading--ellipsis"><em class="p-media__heading-date">2026-07-23</em></div>
          <a href="./selectBbsNttView.do?bbsNo=5014&amp;nttNo=801263&amp;key=3731&amp;pageUnit=10&amp;pageIndex=1" class="p-media__content">
            <em class="p-media__subject">포천시, &#039;2026 한국의 최고 경영대상&#039; 도시브랜드 문화관광도시 부문 대상 수상</em>
          </a>
        </li>
      </ul>
    `;

    expect(parseListPage(html)).toEqual([
      {
        seq: "801272",
        title:
          "포천시정신건강복지센터-포천교육지원청, 2026년 아동·청소년 정신건강 캠페인 공개강좌 성료",
        publishedDate: "2026-07-23",
        sourceUrl:
          "https://www.pocheon.go.kr/www/selectBbsNttView.do?bbsNo=5014&nttNo=801272&key=3731&pageUnit=10&pageIndex=1",
      },
      {
        seq: "801263",
        title:
          "포천시, '2026 한국의 최고 경영대상' 도시브랜드 문화관광도시 부문 대상 수상",
        publishedDate: "2026-07-23",
        sourceUrl:
          "https://www.pocheon.go.kr/www/selectBbsNttView.do?bbsNo=5014&nttNo=801263&key=3731&pageUnit=10&pageIndex=1",
      },
    ]);
  });

  it("상세 contenttext에서 이미지/첨부 블록 없이 의미 있는 본문을 추출한다", () => {
    const paragraphs = [
      "포천시정신건강복지센터는 7월 22일 포천시청 대회의실에서 2026년 아동·청소년 정신건강 캠페인 대국민 공개강좌를 성황리에 개최했다.",
      "이번 강좌는 대한소아청소년정신의학회가 주최하고 포천시정신건강복지센터와 경기도포천교육지원청이 공동 주관했다.",
      "강의는 아이에게 딱 하나만 가르친다면 자기조절을 주제로 임종석 포천시정신건강복지센터장이 진행했다.",
      "이날 강좌에는 학부모와 교육기관 종사자, 사회복지 및 아동청소년 관련 기관 종사자, 지역주민 등 많은 시민이 참석했다.",
      "센터는 앞으로도 지역사회와 함께 아동청소년의 정신건강 증진과 인식 개선을 위해 다양한 교육과 예방사업을 추진하겠다고 밝혔다.",
    ].map((p) => `<p style="margin:0"><span>${p}</span></p>`).join("<p><br></p>");
    const html = `
      <div class="bbs_viewbox">
        <div class="subjectbox">
          <span class="subject">포천시정신건강복지센터-포천교육지원청, 2026년 아동·청소년 정신건강 캠페인 공개강좌 성료</span>
        </div>
        <div class="viewcontentbox">
          <div class="viewcontent">
            <div class="contenttext">
              <div class="photo_area clearfix"><div class="photo_view"><img src="/DATA/bbs/5014/test.jpg" alt=""></div></div>
              ${paragraphs}
            </div>
          </div>
          <div class="viewcontent"><div class="attachedfile"><span class="attach_tit">첨부파일</span></div></div>
        </div>
      </div>
    `;

    const body = parseDetailBody(html);
    expect(body).not.toBeNull();
    expect(body).toContain("포천시정신건강복지센터");
    expect(body).toContain("정신건강 캠페인");
    expect(body).not.toContain("첨부파일");
    expect(body!.length).toBeGreaterThan(250);
  });
});
