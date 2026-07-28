// gumi parser 회귀 방어. 구미시 보도자료의
// YH bod_webzine card + bod_view detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/gumi";

describe("gumi local press parser", () => {
  it("parses bod_webzine cards with data-req-get-p-idx ids", () => {
    const html = `
      <div class="bod_webzine">
        <ul class="clFix">
          <li>
            <a href="#" onclick="yhLib.inline.post(this); return false;" data-req-form-id="viewForm" data-req-merge-form-id="listForm" data-req-get-p-idx="840515">
              <span class="blind">2,844명 찾은 구미+ 어린이재활센터…지역 안착 속 공식 개소 게시글 상세보기</span>
              <div class="cont">
                <span class="tit">2,844명 찾은 구미+ 어린이재활센터…지역 안착 속 공식 개소</span>
                <span class="info"><span class="name"><i>작성자</i> 구미보건소 보건의료정책과</span><span class="date"><i>작성일</i> 2026-07-27(월)</span></span>
                <span class="txt">2,844명 찾은 구미+ 어린이재활센터…지역 안착 속 공식 개소<br>- 전문인력 20명 상주</span>
              </div>
            </a>
          </li>
          <li>
            <a href="#" onclick="yhLib.inline.post(this); return false;" data-req-get-p-idx="840514">
              <span class="tit">구미시, AI 시대 차세대 첨단 신소재 생태계 조성 시동</span>
              <span class="date"><i>작성일</i> 2026-07-27(월)</span>
              <span class="txt">제14회 구미 미래신산업포럼 개최</span>
            </a>
          </li>
        </ul>
      </div>
    `;

    expect(parseListItems(html)).toEqual([
      {
        seq: "840515",
        title: "2,844명 찾은 구미+ 어린이재활센터…지역 안착 속 공식 개소",
        publishedDate: "2026-07-27",
        sourceUrl:
          "https://www.gumi.go.kr/portal/board/post/view.do?bcIdx=211&mid=0504020000&idx=840515",
      },
      {
        seq: "840514",
        title: "구미시, AI 시대 차세대 첨단 신소재 생태계 조성 시동",
        publishedDate: "2026-07-27",
        sourceUrl:
          "https://www.gumi.go.kr/portal/board/post/view.do?bcIdx=211&mid=0504020000&idx=840514",
      },
    ]);
  });

  it("parses bod_view visible detail and excludes file-list noise", () => {
    const article =
      "2,844명 찾은 구미+ 어린이재활센터…지역 안착 속 공식 개소 - 3월 운영 시작 4개월 만에 이용객 2,844명 지역 소아 재활 거점 자리매김 - 전문의 재활치료사 등 전문인력 20명 상주 장애 발달지연 아동 맞춤 치료 구미시는 27일 갑을구미재활병원에서 구미+ 어린이재활센터 공식 개소식을 열고 지역 소아청소년 필수의료 체계 강화에 나섰다. 지난 3월 운영을 시작한 센터는 6월말까지 누적 이용객 2,844명을 기록하며 지역 소아 재활 수요를 안정적으로 뒷받침하고 있다.";
    const html = `
      <div class="bod_view">
        <div class="subject">2,844명 찾은 구미+ 어린이재활센터…지역 안착 속 공식 개소</div>
        <div class="view_info"><ul><li class="view_write"><span>작성자</span> 구미보건소 보건의료정책과 / 054-480-4977</li><li class="view_date"><span>등록일</span> 2026-07-27(월)</li></ul></div>
        <div class="view_cont"><img alt="사진"><div class="mT10 allRevert"><p>${article}</p><div data-editor-article></div></div></div>
        <dl class="view_file clFix"><dt><span>첨부 파일</span></dt><dd><a class="download">구미+ 어린이재활센터.jpg</a></dd></dl>
      </div>
    `;

    const parsed = parseDetailBody(html);
    expect(parsed).toContain("구미보건소 보건의료정책과");
    expect(parsed).toContain("구미시는 27일 갑을구미재활병원");
    expect(parsed).not.toContain("첨부 파일");
    expect(parsed).not.toContain("어린이재활센터.jpg");
    expect(parsed && parsed.length).toBeGreaterThan(250);
  });
});
