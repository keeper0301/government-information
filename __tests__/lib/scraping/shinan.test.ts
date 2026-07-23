// shinan parser 회귀 방어. 신안군청 공식 보도자료/해명의
// table 목록과 show_form 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/shinan";

const MOCK_LIST_HTML = `
<table class="list_table" id="board_list_table">
  <tbody>
    <tr>
      <td class="list_idx">7,373</td>
      <td class="list_title" style="padding-left:0px;">
        <img src="/images/board/icon_file.gif" alt="첨부파일" />
        <img src="/images/board/icon_image.gif" alt="사진파일" />
        <a href="/home/www/openinfo/participation_07/participation_07_03/show/142507?page=1&amp;search=&amp;keyword=" class="">신안군, 체류형 관광 활성화 총력... ‘지역 소득...</a>
        <img src="/images/board/new.gif" alt="새로운글" />
      </td>
      <td class="list_member_name">문화관광과</td>
      <td class="list_reg_date">2026-07-23</td>
      <td class="list_visit">38</td>
    </tr>
    <tr>
      <td class="list_idx">7,372</td>
      <td class="list_title" style="padding-left:0px;">
        <a href="/home/www/openinfo/participation_07/participation_07_03/show/142505?page=1&amp;search=&amp;keyword=" class="">지도읍 사회단체, ‘온기 회복 건강한 여름나기 삼계...</a>
      </td>
      <td class="list_member_name">지도읍</td>
      <td class="list_reg_date">2026-07-23</td>
      <td class="list_visit">62</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<table class="show_form">
  <caption>글 내용보기</caption>
  <tbody>
    <tr>
      <th scope="row"><label>등록부서</label></th>
      <td class="colspan3"><span>태양광과</span></td>
      <th scope="row"><label>등록일</label></th>
      <td class="colspan3"><span>2025-01-24 13:17:00</span></td>
    </tr>
    <tr>
      <th scope="row"><label>제목</label></th>
      <td colspan="3"><span>신안군, 햇빛연금 220억 원 돌파!</span></td>
    </tr>
    <tr>
      <th scope="row"><label>내용</label></th>
      <td colspan="3" class="content">
        <div id="img_control" class="img_control">
          <img src="/module/wsboard/data/www_bodo/sample.jpg" alt="신안군, 햇빛연금 220억 원 돌파! 1" />
        </div>
        <span>-‘25년 120억 →‘26년 137억 예정, 매년 가파르게 증가 <br />
        - 햇빛·바람 연금 지급 확대, 26년 신안군민 52% 혜택<br /><br />
        신안군은 햇빛연금 누적 수익액이 220억 원을 넘어섰다고 발표했다. 햇빛연금은 2021년 첫 지급액 21억 원으로 시작하여 매년 급격히 증가하며, 지역 주민들에게 실질적인 경제적 혜택을 제공하고 있다.<br /><br />
        특히 전남해상풍력 사업과 신의 태양광발전 사업이 완공되면 주민 배당과 지역경제 선순환 효과가 확대될 것으로 기대된다.<br /><br />
        군은 앞으로도 주민 수용성을 기반으로 재생에너지 이익공유 정책을 안정적으로 추진하고, 섬 지역 주민들의 삶의 질 개선과 지속 가능한 성장 기반을 강화할 계획이다.</span>
      </td>
    </tr>
  </tbody>
</table>
`;

describe("shinan parseListPage", () => {
  it("목록 table row에서 show id, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "142507",
      title: "신안군, 체류형 관광 활성화 총력... ‘지역 소득...",
      publishedDate: "2026-07-23",
      sourceUrl:
        "https://www.shinan.go.kr/home/www/openinfo/participation_07/participation_07_03/show/142507?page=1&search=&keyword=",
    });
    expect(items[1]).toMatchObject({
      seq: "142505",
      title: "지도읍 사회단체, ‘온기 회복 건강한 여름나기 삼계...",
      publishedDate: "2026-07-23",
    });
  });
});

describe("shinan parseDetailBody", () => {
  it("show_form 상세 제목과 내용 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("햇빛연금 누적 수익액");
    expect(body).toContain("재생에너지 이익공유 정책");
    expect(body).not.toContain("img_control");
    expect(body).not.toContain("sample.jpg");
  });
});
