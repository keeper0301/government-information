// suyeong-eminwon parser 회귀 방어. 부산 수영구 보도자료의
// eminwon Mini searchDetail list + POST detail body 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseEminwonDetailBody } from "@/lib/scraping/local-press/_eminwon_helper";
import { parseMiniListItems } from "@/lib/scraping/local-press/suyeong-eminwon";

const MOCK_LIST_HTML = `
<div class="news_con">
  <a href="javaScript:searchDetail('8929','DOM_000000103001006001')" class="news_list">
    <h3 class="dotdotdot">한국자유총연맹 수영구지회 광안1동 위원회
여름맞이 “엄지마을 클린데이” 실시</h3>
    <p class="con_txt dotdotdot"></p>
    <span class="date">2026.07.23</span>
  </a>
  <a href="javaScript:searchDetail('8928','DOM_000000103001006001')" class="news_list">
    <h3 class="dotdotdot">수영동 청소년지도협의회, 여름휴가철 피서지
「청소년 유해환경 개선 캠페인」실시</h3>
    <span class="date">2026.07.23</span>
  </a>
</div>
`;

const MOCK_DETAIL_HTML = `
<table class="bbs_vtype">
  <thead>
    <tr><th colspan="4">한국자유총연맹 수영구지회 광안1동 위원회 여름맞이 “엄지마을 클린데이” 실시</th></tr>
  </thead>
  <tbody>
    <tr>
      <th>작성부서</th><td>기획감사실</td><th>등록일자</th><td>2026-07-23</td>
    </tr>
    <tr>
      <th>첨부파일</th>
      <td colspan="3"><a href="#">보도자료.hwpx</a><br><a href="#">보도사진.jpg</a></td>
    </tr>
    <tr>
      <td colspan="4" class="contents">
        부산광역시 수영구 광안1동 행정복지센터는 지난 7월 22일 한국자유총연맹 수영구지회 광안1동 위원회에서 여름을 맞이하여 깨끗하고 아름다운 엄지마을 조성을 위한 관내 환경정비 활동인 엄지마을 클린데이를 실시하였다고 밝혔다. 자유총연맹 광안1동위원회 회원들은 평소 저소득층 기부활동, 환경정비 활동 등 다양한 봉사활동을 하고 있으며, 이날 활동에는 회원 8명이 참여하여 관내 어린이놀이터와 주변 골목길을 순찰하면서 무단투기 쓰레기를 수거하는 등 정비활동을 실시하였다. 수영구는 앞으로도 쾌적한 도시 미관을 위해 주민과 함께하는 환경정비를 이어가겠다고 전했다.
      </td>
    </tr>
  </tbody>
</table>
`;

describe("suyeong eminwon mini local press parser", () => {
  it("parses searchDetail mini news list items", () => {
    const items = parseMiniListItems(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      newsEpctNo: "8929",
      title: "한국자유총연맹 수영구지회 광안1동 위원회 여름맞이 “엄지마을 클린데이” 실시",
      publishedDate: "2026-07-23",
      sourceUrl:
        "https://www.suyeong.go.kr/index.suyeong?menuCd=DOM_000000103001006001&H_SEQ=8929",
    });
  });

  it("extracts visible contents body from eminwon detail", () => {
    const body = parseEminwonDetailBody(MOCK_DETAIL_HTML);

    expect(body).toContain("부산광역시 수영구 광안1동 행정복지센터");
    expect(body?.length).toBeGreaterThan(250);
  });
});
