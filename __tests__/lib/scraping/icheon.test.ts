// icheon parser 회귀 방어. 이천시청 공식 보도자료의
// YH board/post 사진 목록과 view_cont 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/icheon";

describe("icheon local press parser", () => {
  it("사진형 목록에서 id/title/date/sourceUrl을 추출한다", () => {
    const html = `
      <div class="bod_photo">
        <ul class="clFix">
          <li>
            <a href="#" title="게시글 상세 열람" onclick="yhLib.inline.post(this); return false;"
              data-req-form-id="viewForm" data-req-merge-form-id="listForm" data-req-get-p-idx="320187">
              <div class="thumb"><span class="figure"><img src="/common/file/img/view.do" alt=""></span></div>
              <div class="cont">
                <span class="tit">새마을지도자 중리동남녀협의회, 2026년 경로대잔치 개최</span>
                <span class="date">2026-07-23(Thu)</span>
              </div>
            </a>
          </li>
          <li>
            <a href="#" title="게시글 상세 열람" onclick="yhLib.inline.post(this); return false;"
              data-req-form-id="viewForm" data-req-merge-form-id="listForm" data-req-get-p-idx="320181">
              <div class="cont">
                <span class="tit">제23회 설봉산 별빛축제, 돗자리와 함께 즐기세요&hellip; 우천 시 일정 변경 가능</span>
                <span class="date">2026-07-23(Thu)</span>
              </div>
            </a>
          </li>
        </ul>
      </div>
    `;

    expect(parseListPage(html)).toEqual([
      {
        seq: "320187",
        title: "새마을지도자 중리동남녀협의회, 2026년 경로대잔치 개최",
        publishedDate: "2026-07-23",
        sourceUrl:
          "https://www.icheon.go.kr/news/board/post/view.do?bcIdx=785&mid=0301000000&idx=320187",
      },
      {
        seq: "320181",
        title:
          "제23회 설봉산 별빛축제, 돗자리와 함께 즐기세요… 우천 시 일정 변경 가능",
        publishedDate: "2026-07-23",
        sourceUrl:
          "https://www.icheon.go.kr/news/board/post/view.do?bcIdx=785&mid=0301000000&idx=320181",
      },
    ]);
  });

  it("상세 view_cont에서 이미지/첨부 블록 없이 의미 있는 본문을 추출한다", () => {
    const paragraphs = [
      "- 다채로운 공연 프로그램과 푸짐한 만찬으로 어르신 호응도 높아 -",
      "이천시 새마을중리동남녀협의회가 7월 22일 이천 빌라드아모르에서 중리동 관내 어르신 500여 명을 모시고 만수무강을 기원하는 경로잔치를 개최했다.",
      "경로잔치는 중리동 평생학습동아리의 판소리 공연과 라인댄스 공연 등 다채로운 식전공연에 이어 푸짐한 만찬을 준비해 어르신들의 큰 호응을 얻었다.",
      "이날 행사는 새마을회원들이 정성껏 모은 기금으로 마련돼 더욱 뜻깊었고, 참석자들은 지역 공동체의 따뜻한 마음을 함께 나눴다.",
      "성수석 이천시장은 어르신들의 건강과 행복을 기원하며 봉사에 앞장서는 새마을중리동남녀협의회 회원들에게 감사의 뜻을 전했다.",
    ].join("<br>");
    const html = `
      <div class="bod_view">
        <div class="subject">새마을지도자 중리동남녀협의회, 2026년 경로대잔치 개최</div>
        <div class="view_info"><li class="view_date"><span>등록일</span>2026-07-23(Thu)</li></div>
        <div class="view_cont">
          <img src="/common/file/img/view.do" alt="새마을지도자 중리동남녀협의회, 2026년 경로대잔치 개최">
          <div class="mT10">${paragraphs}</div>
        </div>
        <dl class="view_file"><dt><span>첨부 파일</span></dt><dd>photo.jpg</dd></dl>
      </div>
    `;

    const body = parseDetailBody(html);
    expect(body).not.toBeNull();
    expect(body).toContain("새마을지도자 중리동남녀협의회");
    expect(body).toContain("이천시");
    expect(body).not.toContain("첨부 파일");
    expect(body!.length).toBeGreaterThan(250);
  });
});
