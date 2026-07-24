// yeoncheon parser 회귀 방어. 연천군청 공식 보도자료의
// SI p-media gallery 목록과 bbs_content 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/yeoncheon";

describe("yeoncheon local press parser", () => {
  it("p-media gallery 목록에서 id/title/date/sourceUrl을 추출한다", () => {
    const html = `
      <div class="p-media--gallery">
        <ul class="p-media-list p-media--cell3">
          <li class="p-media">
            <a href="./selectBbsNttView.do?key=3398&amp;id=&amp;bbsNo=29&amp;nttNo=107763&amp;searchCtgry=&amp;searchCnd=all&amp;searchKrwd=&amp;pageIndex=1&amp;integrDeptCode=" class="p-media__link">
              <div class="p-media__image"><img src="/imgLoad.do?url=/DATA/bbs/29/thumb/test.jpg&amp;type=board" alt="연천군보건의료원 이미지" /></div>
              <div class="p-media__body">
                <div class="p-media__heading">
                  <em class="p-media__heading-text">
                    연천군보건의료원,&nbsp;‘2026년&nbsp;하반기&nbsp;찾아가는&nbsp;1일&nbsp;건강증진실’&nbsp;운영
                  </em>
                </div>
                <div class="p-author__info">
                  <time datetime="2026-07-24" class="p-split">2026.07.24</time>
                </div>
              </div>
            </a>
          </li>
        </ul>
      </div>
    `;

    expect(parseListPage(html)).toEqual([
      {
        seq: "107763",
        title: "연천군보건의료원, ‘2026년 하반기 찾아가는 1일 건강증진실’ 운영",
        publishedDate: "2026-07-24",
        sourceUrl:
          "https://www.yeoncheon.go.kr/www/selectBbsNttView.do?key=3398&bbsNo=29&nttNo=107763&pageIndex=1",
      },
    ]);
  });

  it("상세 bbs_content에서 사진 영역을 제외하고 의미 있는 본문을 추출한다", () => {
    const bodyHtml = [
      "연천군보건의료원은 지역 주민의 만성질환 예방과 건강 증진을 위해 ‘2026년 하반기 찾아가는 1일 건강증진실’을 운영한다고 밝혔다.",
      "이번 사업은 의료 접근성이 떨어지는 지역 주민을 위해 전문 인력이 직접 현장을 찾아가 종합적인 보건 서비스를 제공하고자 마련됐다.",
      "현장에서는 공복 상태를 유지한 주민을 대상으로 혈압·혈당·콜레스테롤 측정 등 기초 건강 검사를 실시하고 측정 결과를 바탕으로 맞춤형 상담을 진행한다.",
      "또한 허리둘레 및 인바디 검사, 영양·운동 지도, 금연·절주 및 구강보건 교육 등 다채로운 건강 증진 프로그램을 제공한다.",
      "보건의료원 관계자는 주민들이 스스로 건강을 관리하는 습관을 기르길 바란다고 전했다.",
    ].join("<br/>");
    const html = `
      <table class="p-table block">
        <tbody class="p-table--th-left">
          <tr><th scope="row">제목</th><td>연천군보건의료원, ‘2026년 하반기 찾아가는 1일 건강증진실’ 운영</td></tr>
          <tr>
            <td colspan="2" title="내용" class="bbs_content">
              <div class="p-photo"><div class="p-photo__wrap"><img src="/imgLoad.do?url=/DATA/bbs/29/test.jpg&type=board" alt="본문 사진" /></div></div>
              <div class="content_text">${bodyHtml}</div>
            </td>
          </tr>
          <tr><th scope="row">파일</th><td><ul class="p-attach"><li>첨부파일</li></ul></td></tr>
        </tbody>
      </table>
    `;

    const body = parseDetailBody(html);
    expect(body).toContain("만성질환 예방과 건강 증진");
    expect(body).toContain("구강보건 교육");
    expect(body?.length).toBeGreaterThan(250);
  });
});
