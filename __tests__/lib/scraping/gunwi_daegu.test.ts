// gunwi_daegu parser 회귀 방어. 대구 군위군 보도/해명의
// tbl_board list + boardView detail/HWP attachment 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/gunwi_daegu";

const LIST_HTML = `
<table class="tbl_board">
  <tbody>
    <tr>
      <td class="num">5,948</td>
      <td class="taL subject">
        <a href="?srchVote=-1&amp;srchEnable=1&amp;mnu_uid=106&amp;&amp;bod_uid=140919&amp;pageNo=1&amp;cmd=2">
          <span class="bod_title">7월 24일 보도자료</span>
        </a>
      </td>
      <td>기획감사실</td>
      <td class="date">2026-07-24</td>
      <td class="file"><img src="/Manager/images/ico_file.gif" alt="첨부파일 6개" /></td>
    </tr>
  </tbody>
</table>
`;

const DETAIL_HTML = `
<div class="boardView">
  <div class="title">
    <h4>7월 24일 보도자료</h4>
    <dl class="data">
      <dt>작성자</dt><dd>기획감사실</dd>
      <dt>등록일</dt><dd>2026-07-24</dd>
    </dl>
    <p class="file">
      <a title="군위군 보도자료(26.7.24.).hwp 파일 다운로드" href="/fixture_download.do?file_uid=179956">
        군위군 보도자료(26.7.24.).hwp
      </a>
    </p>
  </div>
  <div class="cont">
    <p>
      군위군은 주민 생활 안정과 지역 활력 회복을 위해 다양한 지원사업을 추진한다.
      이번 보도자료에는 소보면 기초생활거점조성사업, 취약계층 치과치료 지원,
      주민참여예산 퍼실리테이터 운영, 사회복지시설 평가 성과, 청소년 활동 지원 등
      군민이 체감할 수 있는 행정 소식이 담겨 있다. 관계자는 앞으로도 현장 중심의
      행정 서비스를 강화하고 주민 참여를 넓혀 군민 모두가 행복한 군위를 만들겠다고 밝혔다.
      특히 각 부서는 사업별 추진 일정과 신청 방법을 자세히 안내하고, 필요한 경우 읍면
      행정복지센터를 통해 상담을 받을 수 있도록 연계할 계획이다.
    </p>
  </div>
</div>
`;

describe("gunwi_daegu parsers", () => {
  it("parses Gunwi board list rows", () => {
    const items = parseListItems(LIST_HTML);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "140919",
      title: "7월 24일 보도자료",
      publishedDate: "2026-07-24",
    });
    expect(items[0]?.sourceUrl).toContain("/ko/page.do?");
    expect(items[0]?.sourceUrl).toContain("cmd=258");
    expect(items[0]?.sourceUrl).toContain("bod_uid=140919");
    expect(items[0]?.sourceUrl).toContain("mnu_uid=106");
  });

  it("parses visible boardView body as fallback", async () => {
    const body = await parseDetailBody(DETAIL_HTML);
    expect(body).toContain("군위군은 주민 생활 안정");
    expect(body).toContain("현장 중심의 행정 서비스");
    expect(body?.length).toBeGreaterThan(250);
  });
});
