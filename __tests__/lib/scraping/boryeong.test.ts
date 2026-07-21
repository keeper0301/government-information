// boryeong parser 회귀 방어. 보령시청 공식 보도자료의
// eminwon popupCenter 목록과 OfrAction 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/boryeong";

const MOCK_LIST_HTML = `
<table class="basic_table center">
  <tbody>
    <tr>
      <td class="problem_number">11167</td>
      <td class="left">
        <div class="list_subject">
          <span class="link"><a href="#popup" onclick="popupCenter('http://eminwon.brcn.go.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do?method=selectOfrNews&amp;methodnm=selectOfrNewsMgt&amp;jndinm=OfrBcAdvNewsEJB&amp;context=NTIS&amp;subCheck=N&amp;data_open_yn=1&amp;initValue=Y&amp;countYn=Y&amp;news_epct_no=16121', 'popwin'); return false;">보령시, 민선9기 공약사항 추진계획 보고회 개최... ‘시민과의 약속’ 설계</a></span>
        </div>
      </td>
      <td class="problem_name">기획감사실</td>
      <td class="date">2026-07-15</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<table width="100%" border="0" cellspacing="1" cellpadding="0" summary="보도자료 상세조회">
  <thead>
    <tr>
      <th width="100" height="22" align="center" bgcolor="#BAE6E7">작성부서</th>
      <th width="285" bgcolor="#F5FAF5">홍보미디어실</th>
      <th width="100" height="22" align="center" bgcolor="#BAE6E7">등록일자</th>
      <th width="285" bgcolor="#F5FAF5">2026-07-15</th>
    </tr>
    <tr>
      <th width="100" height="22" align="center" bgcolor="#BAE6E7">제목</th>
      <td bgcolor="#F5FAF5" colspan="3">보령시, 민선9기 공약사항 추진계획 보고회 개최... ‘시민과의 약속’ 설계</td>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="word-break:break-all;" colspan="4">
        보령시는 지난 14일 시청 중회의실에서 ‘민선9기 공약사항 추진계획 보고회’를 개최하고 시민과의 약속을 구체화하기 위한 공약별 실행계획을 점검했다.<br><br>
        보고회에 앞서 시민 중심의 투명하고 공정한 공약 이행을 위한 공약이행평가단 위촉식도 진행됐다. 평가단은 앞으로 공약 추진 상황과 이행 실적을 객관적으로 평가하고 시민의 의견을 시정에 전달하는 역할을 맡는다.<br><br>
        이날 보고회에서는 25개 소관부서가 총 76개 공약의 추진 방향과 실행계획, 재원 투자계획, 문제점 등을 보고했다. 이어 전 부서와 공약이행평가단이 참여한 종합토론을 통해 공약의 실현 가능성과 정책 효과를 높이기 위한 보완사항을 점검하고 부서 간 연계 협업 방안을 논의했다.<br><br>
        엄승용 보령시장은 시민이 변화를 체감할 수 있도록 책임감 있게 추진하겠다고 말했다.
      </td>
    </tr>
  </tbody>
</table>
`;

describe("boryeong parseListPage", () => {
  it("popupCenter 목록에서 news_epct_no, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "16121",
      title: "보령시, 민선9기 공약사항 추진계획 보고회 개최... ‘시민과의 약속’ 설계",
      publishedDate: "2026-07-15",
    });
    expect(items[0].sourceUrl).toContain("news_epct_no=16121");
  });
});

describe("boryeong parseDetailBody", () => {
  it("상세조회 table 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("보령시는 지난 14일");
    expect(body).toContain("공약사항 추진계획 보고회");
  });
});
