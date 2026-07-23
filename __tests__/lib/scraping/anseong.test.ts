// anseong parser 회귀 방어. 안성시청 공식 보도자료의
// Saeol newsList 목록과 bod_view 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/anseong";

describe("anseong local press parser", () => {
  it("Saeol 목록 table에서 id/title/date/sourceUrl을 추출한다", () => {
    const html = `
      <table class="tableSt_list row_over">
        <tbody>
          <tr>
            <td>13993</td>
            <td class="taL">
              <a href="#" onclick="javascript:boardView('1', '20973');return false;">
                공예체험 즐기고 한우 할인까지 ‘안성문화장 여름 기획전’ 운영
              </a>
            </td>
            <td>도시경제국 문화관광과</td>
            <td>2026-07-16</td>
          </tr>
          <tr>
            <td>13992</td>
            <td class="taL">
              <a href="#" onclick="javascript:boardView('1', '20949');return false;">
                안성시, 평생학습 장터 상반기 운영 성료
              </a>
            </td>
            <td>복지교육국 체육평생학습과</td>
            <td>2026-07-14</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseListPage(html)).toEqual([
      {
        seq: "20973",
        title: "공예체험 즐기고 한우 할인까지 ‘안성문화장 여름 기획전’ 운영",
        publishedDate: "2026-07-16",
        sourceUrl:
          "https://www.anseong.go.kr/portal/saeol/newsView.do?newsEpctNo=20973&mId=0502010100",
      },
      {
        seq: "20949",
        title: "안성시, 평생학습 장터 상반기 운영 성료",
        publishedDate: "2026-07-14",
        sourceUrl:
          "https://www.anseong.go.kr/portal/saeol/newsView.do?newsEpctNo=20949&mId=0502010100",
      },
    ]);
  });

  it("상세 view_cont에서 이미지/첨부 블록 없이 의미 있는 본문을 추출한다", () => {
    const paragraphs = [
      "안성시가 2024년 경기도 시군 농정업무 평가에서 우수 기관으로 선정되어 장려를 수상했다고 밝혔다.",
      "경기도는 수원컨벤션센터에서 진행된 경기도 농업인의 날 기념행사에서 시군 농정업무 평가 우수기관 표창 및 경기도 농어민대상 수상자들을 시상했다.",
      "농정업무평가는 도 농정 주요과제와 시군 정책의 연계성 강화 및 혁신적인 농정시책 발굴을 위해 실시하는 것으로 도내 시군을 그룹별로 나누어 진행된다.",
      "안성시는 작년에 이어 장려상을 수상하였으며 4년 연속 경기도 농정업무 우수기관으로 선정되는 영광을 안았다.",
      "농업기술센터는 앞으로도 안성시 농업 발전과 농업인의 복지 증진을 위해 다양한 농정시책을 추진하겠다고 밝혔다.",
    ].join("<br><br>");
    const html = `
      <div class="bod_view">
        <h4>안성시, 경기도 시・군 농정업무 평가 ‘장려’ 수상</h4>
        <div class="view_info"><li class="view_date"><span>등록일</span> : 2024-11-19</li></div>
        <div class="view_cont">
          <img src="/common/imgSaeolViewer.do" alt="">
          ${paragraphs}
        </div>
        <dl class="view_file"><dt><span>첨부 파일</span></dt><dd>photo.jpg</dd></dl>
      </div>
    `;

    const body = parseDetailBody(html);
    expect(body).not.toBeNull();
    expect(body).toContain("안성시");
    expect(body).toContain("농정업무 평가");
    expect(body).not.toContain("첨부 파일");
    expect(body!.length).toBeGreaterThan(250);
  });
});
