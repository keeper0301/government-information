// cheongyang parser 회귀 방어. 청양군청 공식 보도자료의
// BBSMSTR_000000000064 bodo_list와 basic_table 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/cheongyang";

const MOCK_LIST_HTML = `
<div class="bodo_list">
  <div class="item">
    <div class="descpt">
      <a href="/cop/bbs/BBSMSTR_000000000064/selectBoardArticle.do;jsessionid=abc?nttId=207894&amp;pageIndex=1&amp;searchCnd=&amp;searchWrd=">
        <strong class="subject">김홍열 청양군수, 민선9기 첫 ‘주민과의 대화’ 성료</strong>
        <span class="pt">현장 청취 통해 현장 밀착형 건의 수렴
          <span class="opt"><span class="date">2026.07.20</span></span>
        </span>
      </a>
    </div>
  </div>
</div>
`;

const MOCK_DETAIL_HTML = `
<div class="prog_content">
  <table class="basic_table">
    <tbody>
      <tr>
        <th scope="row">제목</th>
        <td colspan="5">김홍열 청양군수, 민선9기 첫 ‘주민과의 대화’ 성료</td>
      </tr>
      <tr class="problem">
        <th scope="row">작성자</th><td>기획감사실</td>
        <th scope="row">등록일</th><td>2026-07-20</td>
        <th scope="row">조회</th><td>120</td>
      </tr>
      <tr><th scope="row">첨부</th><td colspan="5">첨부 파일</td></tr>
      <tr class="board_images"><td colspan="6" class="center"><img src="photo.jpg" alt="사진" /></td></tr>
      <tr>
        <td colspan="6">
          현장 청취 통해 현장 밀착형 건의 수렴…신속 해결 및 군정 적극 반영<br/>
          청양군&#40;군수 김홍열&#41;이 20일 민선 9기 군정 운영의 핵심 가치인 현장 행정을 실현하기 위한 10개 읍·면 주민과의 대화를 성공적으로 마무리했다.<br/>
          이번 주민과의 대화는 민선9기 출범에 맞춰 군정 비전과 주요 정책 방향을 군민과 직접 공유하고 주민 생활 현장의 생생한 목소리를 군정에 적극적으로 반영하기 위해 마련됐다.<br/>
          김홍열 군수는 주민들의 건의사항을 일일이 기록하며 적극적인 해결의지를 보였다. 즉시 처리가 가능한 생활 불편 사항은 신속히 조치하고 중장기적인 검토나 예산확보가 필요한 사업은 관련 부서의 협의를 거쳐 구체적인 로드맵을 마련해 주민들에게 알릴 계획이다.
          <div class='codeView04'>공공누리 안내</div>
        </td>
      </tr>
    </tbody>
  </table>
</div>
`;

describe("cheongyang parseListPage", () => {
  it("bodo_list 카드에서 nttId, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "207894",
      title: "김홍열 청양군수, 민선9기 첫 ‘주민과의 대화’ 성료",
      publishedDate: "2026-07-20",
      sourceUrl:
        "https://www.cheongyang.go.kr/cop/bbs/BBSMSTR_000000000064/selectBoardArticle.do?nttId=207894",
    });
  });
});

describe("cheongyang parseDetailBody", () => {
  it("basic_table 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("민선9기 출범");
    expect(body).toContain("2026-07-20");
  });
});
