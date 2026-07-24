// sokcho parser 회귀 방어. 속초시청 공식 보도자료의
// CMPE magazine 목록과 skinTb 상세 본문 구조를 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/sokcho";

describe("sokcho local press parser", () => {
  it("cmpe magazine 목록에서 id/title/date/sourceUrl을 추출한다", () => {
    const html = `
      <div class="cmpe-pseudo-table cmpe-pseudo-table-board">
        <div class="tr"><div class="td"><div class="id-magazin">
          <img src="/sc/servlet/Thumbnail?i=/upload/board/BDAAFF09/test.jpg&w=460&h=308" alt="속초시, 북부권 고도제한 해제 비전 선포식 이미지" class="cmpe-image image-nothing">
          <dl class="cmpe-datalist">
            <dt class="cmpe-psubject">
              <a class="goPage" data-seq="817821" href="#">
                <span class="skinColor-fmInfo">속초시,‘북부권 고도제한 해제 비전 선포식’개최</span>
              </a>
            </dt>
            <dd class="cmpe-pgraph">속초시,‘북부권 고도제한 해제 비전 선포식’개최- 35년 간 멈췄던 발전 시계...</dd>
            <dd style="float: right; color: #8d8d8d;">2026-07-24</dd>
          </dl>
        </div></div></div>
      </div>
    `;

    expect(parseListPage(html)).toEqual([
      {
        seq: "817821",
        title: "속초시,‘북부권 고도제한 해제 비전 선포식’개최",
        publishedDate: "2026-07-24",
        sourceUrl:
          "https://sokcho.go.kr/sc/portal/sokchonews/pressrelease?articleSeq=817821",
      },
    ]);
  });

  it("상세 skinTb-conts에서 이미지/첨부 영역 앞 본문을 추출한다", () => {
    const bodyHtml = [
      "속초시가 35년간 북부권 발전을 가로막아 온 군 통신시설 고도제한 해제를 시민들과 함께 축하하고 새로운 발전 비전을 공식 선포했다.",
      "시는 7월 24일 오전 속초문화예술회관 대강당에서 속초 북부권 고도제한 해제 비전 선포식을 개최했다.",
      "이날 행사에는 지역 주민과 국회의원, 시의회, 강원특별자치도의원, 국방부와 국민권익위원회 관계자 등 6백여 명이 참석했다.",
      "선포식은 추진 과정과 미래 비전을 담은 영상 상영, 감사패와 표창장 수여, 지역대표 소회 발표, 비전 선포 퍼포먼스 순으로 진행됐다.",
      "시는 정주 환경 개선 사업과 관광 기반을 연계해 북부권 발전을 체계적으로 추진할 계획이다.",
    ].map((line) => `<p><span>${line}</span></p>`).join("");
    const html = `
      <div class="skinTb skinTb-data-resList skinTb-data-bgSbj">
        <div class="skinTb-tr"><div class="skinTb-td skinTb-sbj">속초시,‘북부권 고도제한 해제 비전 선포식’개최</div></div>
        <div class="skinTb-tr"><div class="skinTb-th">등록일</div><div class="skinTb-td skinTb-date">2026-07-24</div></div>
        <div class="skinTb-tr">
          <div class="skinTb-td skinTb-conts">
            <p align="center"><strong>속초시,‘북부권 고도제한 해제 비전 선포식’개최</strong></p>
            ${bodyHtml}
          </div>
        </div>
        <div class="boGallery-img"><img src="/upload/board/BDAAFF09/test.jpg" alt="본문 이미지" /></div>
      </div>
    `;

    const body = parseDetailBody(html);
    expect(body).toContain("고도제한 해제");
    expect(body).toContain("비전 선포 퍼포먼스");
    expect(body?.length).toBeGreaterThan(250);
    expect(body).not.toContain("본문 이미지");
  });
});
