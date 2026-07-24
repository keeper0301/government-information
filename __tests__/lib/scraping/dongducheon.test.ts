// dongducheon parser 회귀 방어. 동두천시청 공식 보도자료의
// SI bbs_default 목록/상세 테이블과 공용 SI 본문 파서 hardening을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/dongducheon";

describe("dongducheon local press parser", () => {
  it("bbs_default 목록 테이블에서 id/title/date/sourceUrl을 추출한다", () => {
    const html = `
      <table class="bbs_default list" data-rwdb="yes">
        <tbody>
          <tr class="odd">
            <td data-cell-header="번호 : ">18853</td>
            <td data-cell-header="제목 : " class="subject ">
              <a href="./selectBbsNttView.do?key=1914&amp;bbsNo=95&amp;nttNo=158451&amp;searchCtgry=&amp;searchCnd=all&amp;searchKrwd=&amp;pageIndex=1&amp;integrDeptCode=" >
                불현동, 다섯쌍둥이 가정 찾아 건강한 여름나기 응원
              </a>
            </td>
            <td data-cell-header="제공부서 : ">불현동 행정복지센터</td>
            <td data-cell-header="관련사진 : "><img src="/common/images/board/file/ico_jpg.gif" alt="jpg 파일 있음" /></td>
            <td data-cell-header="작성일 : ">2026.07.22</td>
          </tr>
          <tr class="even">
            <td data-cell-header="번호 : ">18852</td>
            <td data-cell-header="제목 : " class="subject ">
              <a href="./selectBbsNttView.do?key=1914&amp;bbsNo=95&amp;nttNo=158438&amp;searchCtgry=&amp;searchCnd=all&amp;searchKrwd=&amp;pageIndex=1&amp;integrDeptCode=" >
                제26회 동두천 락페스티벌 전국 락밴드 경연대회 참가자 모집
              </a>
            </td>
            <td data-cell-header="제공부서 : ">문화체육과</td>
            <td data-cell-header="관련사진 : "></td>
            <td data-cell-header="작성일 : ">2026.07.22</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseListPage(html)).toEqual([
      {
        seq: "158451",
        title: "불현동, 다섯쌍둥이 가정 찾아 건강한 여름나기 응원",
        publishedDate: "2026-07-22",
        sourceUrl:
          "https://www.ddc.go.kr/ddc/selectBbsNttView.do?key=1914&bbsNo=95&nttNo=158451&searchCtgry=&searchCnd=all&searchKrwd=&pageIndex=1&integrDeptCode=",
      },
      {
        seq: "158438",
        title: "제26회 동두천 락페스티벌 전국 락밴드 경연대회 참가자 모집",
        publishedDate: "2026-07-22",
        sourceUrl:
          "https://www.ddc.go.kr/ddc/selectBbsNttView.do?key=1914&bbsNo=95&nttNo=158438&searchCtgry=&searchCnd=all&searchKrwd=&pageIndex=1&integrDeptCode=",
      },
    ]);
  });

  it("상세 bbs_content에서 이미지 영역 없이 의미 있는 본문을 추출한다", () => {
    const paragraphs = [
      "불현동 행정복지센터는 지난 20일 연일 이어지는 폭염 속에서 관내 다섯쌍둥이 가정을 찾아 부모를 격려하고 아이들의 건강한 여름나기를 응원했다.",
      "박형덕 동두천시장은 이날 직접 가정을 찾아 아이들의 건강과 양육 상황을 살피고 부모가 다섯쌍둥이를 양육하며 겪는 어려움과 건의 사항을 들었다.",
      "동두천시와 불현동 행정복지센터는 이날 들은 의견을 바탕으로 필요한 지원 방안을 지속적으로 검토할 계획이다.",
      "시는 아이들이 건강하고 행복하게 성장할 수 있도록 세심한 관심을 기울이고 아이 키우기 좋은 동두천을 만드는 데 힘쓰겠다고 밝혔다.",
    ].join("<br/>");
    const html = `
      <table class="bbs_default view">
        <tr><th scope="row">제목</th><td>불현동, 다섯쌍둥이 가정 찾아 건강한 여름나기 응원</td></tr>
        <tr>
          <td colspan="2" title="내용" class = 'bbs_content extra'>
            <div style="text-align:center; margin-bottom:10px" class="imgcnt_1"><img src="/photo.jpg" alt=""></div>
            ${paragraphs}
          </td>
        </tr>
      </table>
    `;

    const body = parseDetailBody(html);
    expect(body).toContain("다섯쌍둥이 가정을 찾아");
    expect(body).toContain("아이 키우기 좋은 동두천");
    expect(body?.length).toBeGreaterThan(250);
  });
});
