// donggu_daegu parser 회귀 방어. 대구 동구 보도자료의
// SAEOL news list + visible view_cont detail 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/donggu_daegu";

const MOCK_LIST_HTML = `
<table class="bod_maintain taC">
  <tbody>
    <tr>
      <td>1896</td>
      <td class="taL">
        <a href="#" onclick="req.post(this);" data-action="/portal/saeol/news/view.do" data-keyset="{'newsEpctNo': '10744'}">
          대구 동구 '두두썸동' 5만 인파… 금호강 대표 여름축제 우뚝
        </a>
      </td>
      <td>행정문화교육국 문화관광과</td>
      <td>2026-07-26</td>
      <td>81</td>
    </tr>
    <tr>
      <td>1895</td>
      <td class="taL">
        <a href="#" onclick="req.post(this);" data-action="/portal/saeol/news/view.do" data-keyset="{'newsEpctNo': '10743'}">
          대구 동구, 2단계 공공근로사업 35명 모집
        </a>
      </td>
      <td>경제환경국 일자리경제과</td>
      <td>2026-07-26</td>
      <td>82</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<div class="bod_wrap">
  <div class="bod_view">
    <div class="subject">대구 동구 '두두썸동' 5만 인파… 금호강 대표 여름축제 우뚝</div>
    <div class="view_info"><ul><li class="view_date"><span>등록일</span>2026-07-26</li></ul></div>
    <div class="view_cont">
      대구 동구청은 금호강변 지저둔치에서 개최한 2026 대구 동구 여름축제 두두썸동이 많은 주민과 관광객이 방문한 가운데 성황리에 막을 내렸다고 밝혔다.<br><br>
      올해 축제는 행사기간을 확대하고 물놀이와 공연, 야간 콘텐츠를 결합한 참여형 여름축제로 운영됐다. 가족 단위 방문객은 물론 청년층까지 폭넓은 호응을 얻으며 금호강을 대표하는 여름축제로 자리매김했다.<br><br>
      축제장에서는 워터밤 콘서트, 전국 댄스경연대회, 물총 경도대첩, 워터에어바운스, 가족노래자랑, 버스킹 공연 등 다양한 프로그램이 이어졌다. 구청은 앞으로도 금호강 수변자원을 활용한 차별화된 관광콘텐츠를 지속적으로 발굴할 계획이라고 설명했다.
    </div>
    <dl class="view_file clFix"><dt><span>첨부 파일</span></dt><dd>첨부</dd></dl>
  </div>
</div>
`;

describe("donggu daegu local press parser", () => {
  it("parses SAEOL news list rows", () => {
    const items = parseListItems(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "10744",
      title: "대구 동구 '두두썸동' 5만 인파… 금호강 대표 여름축제 우뚝",
      publishedDate: "2026-07-26",
    });
    expect(items[0]?.sourceUrl).toBe(
      "https://www.dong.daegu.kr/portal/saeol/news/view.do?newsEpctNo=10744&mid=0201070000",
    );
  });

  it("extracts visible view_cont body", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).toContain("대구 동구청은 금호강변 지저둔치");
    expect(body?.length).toBeGreaterThan(250);
  });
});
