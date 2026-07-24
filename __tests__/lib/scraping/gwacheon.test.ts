// gwacheon parser 회귀 방어. 과천시청 공식 보도자료의
// newsList table + fn_go_view(idx) 상세 이동과 view_cont 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/gwacheon";

describe("gwacheon local press parser", () => {
  it("newsList 목록 테이블에서 id/title/date/sourceUrl을 추출한다", () => {
    const html = `
      <table class="bod_maintain">
        <tbody>
          <tr>
            <td class="taC">2225</td>
            <td class="taL">
              <a href="#" onclick="fn_go_view(2271); return false;" title="과천시, 사칭 전자우편 대응 훈련 &lsquo;우수 기관&rsquo; 선정 상세 정보 확인하기">과천시, 사칭 전자우편 대응 훈련 &lsquo;우수 기관&rsquo; 선정</a>
            </td>
            <td class="taC">정보통신과 정보보호팀</td>
            <td class="taC">2026-07-24</td>
            <td class="taC">10</td>
          </tr>
          <tr>
            <td class="taC">2224</td>
            <td class="taL">
              <a href="#" onclick="fn_go_view(2270); return false;" title="과천시, &lsquo;2026 과천공연예술축제&rsquo; 행진 시민 공연자 모집 상세 정보 확인하기">과천시, &lsquo;2026 과천공연예술축제&rsquo; 행진 시민 공연자 모집</a>
            </td>
            <td class="taC">문화체육과 문화예술팀</td>
            <td class="taC">2026-07-24</td>
            <td class="taC">7</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(parseListPage(html)).toEqual([
      {
        seq: "2271",
        title: "과천시, 사칭 전자우편 대응 훈련 '우수 기관' 선정",
        publishedDate: "2026-07-24",
        sourceUrl:
          "https://www.gccity.go.kr/portal/newsList/view.do?mId=0301140100&idx=2271",
      },
      {
        seq: "2270",
        title: "과천시, '2026 과천공연예술축제' 행진 시민 공연자 모집",
        publishedDate: "2026-07-24",
        sourceUrl:
          "https://www.gccity.go.kr/portal/newsList/view.do?mId=0301140100&idx=2270",
      },
    ]);
  });

  it("상세 view_cont에서 사진 뷰어/첨부 UI를 제외하고 본문을 추출한다", () => {
    const paragraphs = [
      "과천시는 행정안전부가 실시한 2026년 상반기 지방정부 사칭 전자우편 대응 훈련에서 우수 기관으로 선정됐다고 밝혔다.",
      "이번 훈련은 전국 지방정부와 공공기관 소속 직원을 대상으로 실시되었으며 실제 사칭 전자우편과 유사한 형태의 메일을 발송한 뒤 대응 체계를 점검하는 방식으로 진행됐다.",
      "과천시는 평소 정보보안 교육과 사칭 전자우편 모의훈련을 정기적으로 실시하고 의심되는 전자우편에 대한 신고 체계를 운영해 왔다.",
      "시는 앞으로도 정보보안 교육을 지속적으로 시행해 시민의 행정정보를 안전하게 보호해 나갈 계획이라고 밝혔다.",
    ].join("<br /><br />");
    const html = `
      <div class="bod_view">
        <h4>과천시, 사칭 전자우편 대응 훈련 &lsquo;우수 기관&rsquo; 선정</h4>
        <div class="view_cont">
          <div class="photo_viewer"><div class="bigViewer"><figure><img src="/common/imgView.do?attachId=a&fileSn=b&mode=origin" alt="과천시청 전경" /></figure></div></div>
          ${paragraphs}
          <div class="photo_viewer"><div class="thumb_list"><button>이전보기</button><button>다음보기</button></div></div>
        </div>
        <dl class="view_file"><dt><span>첨부파일</span></dt><dd>첨부 UI</dd></dl>
      </div>
    `;

    const body = parseDetailBody(html);
    expect(body).toContain("지방정부 사칭 전자우편 대응 훈련");
    expect(body).toContain("시민의 행정정보를 안전하게 보호");
    expect(body).not.toContain("첨부파일");
    expect(body?.length).toBeGreaterThan(250);
  });
});
