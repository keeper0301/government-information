// gongju parser 회귀 방어. 공식 saeolNews 보도자료 게시판의
// fn_search_detail('{newsEpctNo}') 목록과 bbs--view--cont 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/gongju";

const MOCK_LIST_HTML = `
<tbody>
  <tr>
    <td class="first" data-cell-header="번호">9560</td>
    <td data-cell-header="제목" class="subject">
      <a href="#" onclick="fn_search_detail('21702'); return false;">
        공주시, 행정안전부 재난관리평가 ‘우수기관’ 선정
      </a>
    </td>
    <td data-cell-header="담당부서">안전총괄과</td>
    <td data-cell-header="등록일">2026-07-15</td>
  </tr>
</tbody>
`;

const MOCK_DETAIL_HTML = `
<div class="ui bbs--view--cont" data-text-content="true">
  <div class="ui bbs--detail--cont">
    <div class="ui bbs--view--content">
      공주시, 행정안전부 재난관리평가 우수기관 선정<br/>
      공주시는 행정안전부가 실시한 재난관리평가에서 우수기관으로 선정됐다고 밝혔다.<br/>
      이번 평가는 재난관리 책임기관의 예방, 대비, 대응, 복구 등 전 단계 역량을 종합적으로 살펴보는 제도이며, 공주시는 현장 중심의 안전관리 체계와 시민 참여형 재난 예방 활동에서 좋은 평가를 받았다.<br/>
      시는 앞으로도 재난 취약시설 점검과 시민 안전교육을 강화하고 관계기관 협업체계를 정비해 안전한 도시 환경을 조성하겠다고 설명했다.
    </div>
  </div>
</div>
`;

describe("gongju parseListPage", () => {
  it("saeolNews 목록에서 seq, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "21702",
      title: "공주시, 행정안전부 재난관리평가 ‘우수기관’ 선정",
      publishedDate: "2026-07-15",
      sourceUrl:
        "https://www.gongju.go.kr/prog/saeolNews/sub04_02_01/view.do?newsEpctNo=21702",
    });
  });
});

describe("gongju parseDetailBody", () => {
  it("bbs--view--cont 본문에서 한국어 전문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("재난관리평가");
  });
});
