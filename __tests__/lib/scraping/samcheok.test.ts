// samcheok parser 회귀 방어. 공식 SCMS 보도자료 게시판의
// ?gcode=1006&idx={id}&amode=view 목록과 substance 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/samcheok";

const MOCK_LIST_HTML = `
<div class="list1f1t3i1 default bbs-skin-default">
  <ul class="lst1">
    <li class="li1">
      <div class="wrap1">
        <a href="?gcode=1006&amp;idx=141745&amp;amode=view&amp;" class="a1">
          <span class="wrap1texts">
            <strong class="t1">2026. 7. 16. 보도자료</strong>
            <span class="t2">▷ 주요내용 - 삼척시, 2026년 사회복지종사자 대상 주민참여예산학교 교육 실시</span>
            <i class="wrap1t3">
              <span class="t3">2026-07-16</span>
              <span class="t3">기획예산실</span>
            </i>
          </span>
        </a>
      </div>
    </li>
  </ul>
</div>
`;

const MOCK_DETAIL_HTML = `
<div class="bbs1view1">
  <h1 class="h1" id="sns_bbs_title">2026. 7. 16. 보도자료</h1>
  <div class="substance">
    ▷&nbsp;주요내용<br />
    &nbsp;&nbsp;-&nbsp;삼척시,&nbsp;2026년&nbsp;사회복지종사자&nbsp;대상&nbsp;주민참여예산학교&nbsp;교육&nbsp;실시<br />
    &nbsp;&nbsp;-&nbsp;삼척시&nbsp;교육발전특구&nbsp;사업 발달전문가와&nbsp;함께하는&nbsp;학교&nbsp;성료<br />
    &nbsp;&nbsp;-&nbsp;소외계층&nbsp;에너지복지&nbsp;사각지대&nbsp;최소화를&nbsp;위해&nbsp;저소득층&nbsp;연탄&nbsp;쿠폰&nbsp;신청을&nbsp;접수한다<br />
    &nbsp;&nbsp;-&nbsp;2026&nbsp;삼척시&nbsp;애반딧불이&nbsp;생태체험&nbsp;행사&nbsp;개최<br />
    &nbsp;&nbsp;-&nbsp;삼척시,&nbsp;9월&nbsp;정기분&nbsp;재산세&nbsp;부과<br />
    &nbsp;&nbsp;-&nbsp;미로면&nbsp;지역사회보장협의체와&nbsp;영농조합법인이&nbsp;건강한&nbsp;여름나기&nbsp;지원을&nbsp;추진한다<br />
    &nbsp;&nbsp;-&nbsp;삼척중앙새마을금고와&nbsp;함께하는&nbsp;초복맞이&nbsp;삼계탕&nbsp;day를&nbsp;진행한다
  </div>
</div>
`;

describe("samcheok parseListPage", () => {
  it("SCMS 목록에서 seq, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "141745",
      title: "2026. 7. 16. 보도자료",
      publishedDate: "2026-07-16",
      sourceUrl:
        "https://www.samcheok.go.kr/media/00084/00094.web?gcode=1006&amode=view&idx=141745",
    });
  });
});

describe("samcheok parseDetailBody", () => {
  it("substance 본문에서 한국어 전문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("주민참여예산학교");
  });
});
