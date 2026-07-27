// gimcheon parser 회귀 방어. 김천시 보도자료의
// YH bod_blog card + bod_view detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/gimcheon";

describe("gimcheon local press parser", () => {
  it("parses bod_blog cards with goTo.view ids", () => {
    const html = `
      <div class="bod_blog"><ul>
        <li>
          <a href="#" onclick="goTo.view('list','4532037','1944','1203060000',''); return false;" data-action="/portal/bbs/view.do?bIdx=4532037&amp;ptIdx=1944">
            <div class="clFix">
              <img alt="김천시, 2026 아토피·천식 안심학교 교사 대상 역량강화 교육 실시" />
              <div class="cont">
                <span class="tit">보도자료(7. 23.)</span>
                <span class="date"><span>작성일 : 2026-07-27</span><span>작성자 : 문화홍보실</span></span>
                <span class="txt">7. 23. 보도자료입니다. 1. 김천시 산단 기업 임직원 소통 간담회 개최</span>
              </div>
            </div>
          </a>
        </li>
        <li>
          <a href="#" data-action="/portal/bbs/view.do?bIdx=4532036&amp;ptIdx=1944" onclick="goTo.view('list','4532036','1944','1203060000',''); return false;">
            <div class="cont">
              <span class="tit">보도자료(7. 22.)</span>
              <span class="date"><span>작성일 : 2026-07-24</span><span>작성자 : 문화홍보실</span></span>
              <span class="txt">7. 22. 보도자료입니다. 김천시, 2차 공공기관 유치 위해 국회로 총출동!</span>
            </div>
          </a>
        </li>
      </ul></div>
    `;

    expect(parseListItems(html)).toEqual([
      {
        seq: "4532037",
        title: "보도자료(7. 23.)",
        publishedDate: "2026-07-27",
        sourceUrl:
          "https://www.gc.go.kr/portal/bbs/view.do?bIdx=4532037&ptIdx=1944&mId=1203060000",
      },
      {
        seq: "4532036",
        title: "보도자료(7. 22.)",
        publishedDate: "2026-07-24",
        sourceUrl:
          "https://www.gc.go.kr/portal/bbs/view.do?bIdx=4532036&ptIdx=1944&mId=1203060000",
      },
    ]);
  });

  it("parses bod_view visible detail and excludes attached file list", () => {
    const bodyText =
      "7. 23. 보도자료입니다. 1. 김천시 산단 기업 임직원 소통 간담회 개최 2. 김천시, 2026 아토피·천식 안심학교 교사 대상 역량강화 교육 실시 3. 김천시보건소 꿈꾸는 성장 프로젝트 시작 4. 김천시문화예술회관 재개관 기념 콘서트 개최 5. 감문면 기관단체장협의회 회의 개최 6. 감천면 지역사회보장협의체 제7기 구성 완료 7. 자산동 지보협 취약계층 폭염대비 물품 전달";
    const html = `
      <div class="bod_wrap">
        <div class="bod_view">
          <h4>보도자료(7. 23.)</h4>
          <div class="view_info"><ul><li class="view_write"><span>작성자</span> : [박나영] 문화홍보실</li><li class="view_date"><span>등록일</span> : 2026-07-27</li></ul></div>
          <div class="view_cont"><img alt="김천시, 2026 아토피·천식 안심학교 교사 대상 역량강화 교육 실시" /><div class="mT10">${bodyText}</div></div>
          <dl class="view_file"><dt>첨부 파일</dt><dd>보도자료(7.23.).pdf</dd></dl>
        </div>
      </div>
    `;

    const parsed = parseDetailBody(html);
    expect(parsed).toContain("보도자료(7. 23.)");
    expect(parsed).toContain("등록일 : 2026-07-27");
    expect(parsed).toContain("김천시 산단 기업 임직원 소통 간담회");
    expect(parsed).not.toContain("보도자료(7.23.).pdf");
    expect(parsed && parsed.length).toBeGreaterThan(250);
  });
});
