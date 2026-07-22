// muan parser 회귀 방어. 무안군청 공식 보도자료의
// table 목록과 og 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/muan";

const MOCK_LIST_HTML = `
<table class="board_t1 t_w_fixed">
  <tbody>
    <tr>
      <td>9430</td>
      <td class="align_l title_wrap">
        <a href="/www/openmuan/new/report?idx=15203195&amp;mode=view" class="title_cont" title="무안군, 벼 병해충 예찰·중점 방제 지도 총력 에 대한 글내용 보기.">무안군, 벼 병해충 예찰·중점 방제 지도 총력</a><span class="icon_new1">새로운글</span>
      </td>
      <td class="center">식량원예과</td>
      <td class="date center">2026-07-22</td>
      <td class="visit center">5</td>
    </tr>
  </tbody>
</table>
`;

const MOCK_DETAIL_HTML = `
<head>
  <title>무안군, 벼 병해충 예찰·중점 방제 지도 총력  &lt; 보도자료 &lt; 알림마당 &lt; 행정공개 - 무안군청</title>
  <meta property="og:title" content="무안군, 벼 병해충 예찰·중점 방제 지도 총력" />
  <meta property="og:description" content="– 잦은 강우와 고온에 병해충 우려… 농가 적기 방제 당부 -

전남광주통합특별시 무안군은 최근 잦은 강우와 높은 기온으로 병해충 발생에 유리한 환경이 이어짐에 따라 7월 20일부터 8월 15일까지 27일간을 벼 병해충 기본방제기간으로 정하고, 병해충 예찰과 방제 지도, 적기 이삭거름 시용 지도에 총력을 기울이고 있다.

무안군에 따르면 7월 하순부터 8월 중순까지 평균기온이 평년보다 높고 고온·다습한 날씨가 이어질 것으로 전망된다. 이에 따라 잎도열병과 잎집무늬마름병, 깨씨무늬병 등 주요 병해와 멸구류, 혹명나방, 먹노린재 등을 중점 방제 대상으로 정하고 집중적인 예찰과 방제 지도에 나서고 있다.

무안군 관계자는 장마 이후 고온·다습한 환경에서 병해충 발생이 급증할 수 있는 만큼 농가에서는 적기 방제와 이삭거름 시용에 각별히 신경 써 달라고 당부했다." />
</head>
`;

describe("muan parseListPage", () => {
  it("보도자료 목록에서 idx, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "15203195",
      title: "무안군, 벼 병해충 예찰·중점 방제 지도 총력",
      publishedDate: "2026-07-22",
      sourceUrl:
        "https://www.muan.go.kr/www/openmuan/new/report?idx=15203195&mode=view",
    });
  });
});

describe("muan parseDetailBody", () => {
  it("og 상세 제목과 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("무안군, 벼 병해충");
    expect(body).toContain("병해충 예찰과 방제 지도");
  });
});
