// nonsan parser 회귀 방어. 논산시청 공식 보도자료의
// mode=V&no 목록 링크와 bd_detail_cont 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/nonsan";

const MOCK_LIST_HTML = `
<a href="?mode=V&amp;no=69d11a1953cfd51a319a4f8680b896b7">
  논산시, 탑정호 음악분수 21일부터 운영 재개
  - 평일 2회·주말 및 공휴일 3회 운영…낮과 밤 모두 즐기는 명소로 -
  미래전략실 2026-07-21 31 자세히보기
</a>
`;

const MOCK_DETAIL_HTML = `
<div class="bd_detail_tit">
  <h2>논산시, 탑정호 음악분수 21일부터 운영 재개</h2>
  <ul class="info"><li class="date">등록일 : 2026.07.21</li></ul>
</div>
<div class="bd_detail_content">
  <div class="bd_detail_cont">
    <div>
      <p><span>- 평일 2회·주말 및 공휴일 3회 운영…낮과 밤 모두 즐기는 명소로 -</span></p>
      <p>논산시는 지난 6월 임시 중단했던 탑정호 음악분수 운영을 21일부터 재개한다고 밝혔다.</p>
      <p>탑정호 음악분수는 음악과 조명, 분수가 어우러지는 논산의 대표 관광 콘텐츠로 방문객들에게 시원한 볼거리와 휴식 공간을 제공하고 있다.</p>
      <p>시는 저수율 감소에 따라 시설물의 안전한 운영과 장비 파손을 예방하기 위해 음악분수 운영을 일시 중단한 바 있다.</p>
      <p>운영은 매주 화요일부터 일요일까지이며 월요일은 시설 점검과 유지관리를 위해 가동하지 않는다.</p>
      <p>시 관계자는 많은 시민과 관광객들이 탑정호 음악분수를 다시 찾아 시원한 공연과 아름다운 야간 경관을 즐기길 바란다고 밝혔다.</p>
    </div>
  </div>
</div>
`;

describe("nonsan parseListPage", () => {
  it("mode=V 목록 링크에서 hash id, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "69d11a1953cfd51a319a4f8680b896b7",
      title: "논산시, 탑정호 음악분수 21일부터 운영 재개",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.nonsan.go.kr/kor/html/sub03/030106.html?mode=V&no=69d11a1953cfd51a319a4f8680b896b7",
    });
  });
});

describe("nonsan parseDetailBody", () => {
  it("bd_detail_cont 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("탑정호 음악분수");
    expect(body).toContain("2026-07-21");
  });
});
