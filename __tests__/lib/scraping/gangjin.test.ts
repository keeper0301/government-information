// gangjin parser 회귀 방어. 강진군청 공식 보도자료의
// md_list 목록과 og 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/gangjin";

const MOCK_LIST_HTML = `
<div id="tab_content_m1" class="tab_content selected">
  <ul class="md_list" id="news">
    <li>
      <a href="/www/government/news/press?idx=664905&amp;mode=view" title="강진군 “대상포진 걱정 마” 50세부터 무료 접종 에 대한 글내용 보기.">
        <div class="card_body">
          <div class="mid">
            <p class="c_tit">강진군 “대상포진 걱정 마” 50세부터 무료 접종</p>
            <p class="c_sub">강진군이 50세 이상 군민을 대상으로 대상포진 무료 예방접종을 시행한다.</p>
            <ul class="c_exp">
              <li><span class="icon_box"><i class="ico_new">N</i></span>2026-07-20</li>
              <li></li>
              <li>조회수 <span>60</span></li>
              <li>보도자료 등록 <span>2026-07-20</span></li>
            </ul>
          </div>
        </div>
      </a>
    </li>
  </ul>
</div>
`;

const MOCK_DETAIL_HTML = `
<head>
  <title>강진군 “대상포진 걱정 마” 50세부터 무료 접종  &lt; 보도자료 &lt; 군정소식 &lt; 행정정보 - 강진군청</title>
  <meta property="og:title" content="강진군 “대상포진 걱정 마” 50세부터 무료 접종" />
  <meta property="og:description" content="전남도내 선도적 지원 확대로 군민 건강보호··· 건강안전망 강화

강진군이 50세 이상 군민을 대상으로 대상포진 무료 예방접종을 시행하며 군민 건강 보호와 감염병 예방에 적극 나서고 있다.

군은 지난 2023년 대상포진 예방접종 지원 조례를 개정해 기존 60세 이상이던 지원 대상을 50세 이상으로 확대하고, 무료 예방접종 사업을 시행하고 있다.

대상포진은 수두 바이러스가 몸속에 잠복해 있다가 면역력이 떨어질 때 발생하는 질환으로 중장년층과 고령층에서 발생 위험이 높다.

접종 대상은 강진군에 주민등록을 두고 실제 거주하는 만 50세 이상 군민이며, 접종을 희망하는 군민은 신분증을 지참해 강진군보건소를 방문하면 된다." />
</head>
`;

describe("gangjin parseListPage", () => {
  it("보도자료 목록에서 idx, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "664905",
      title: "강진군 “대상포진 걱정 마” 50세부터 무료 접종",
      publishedDate: "2026-07-20",
      sourceUrl:
        "https://www.gangjin.go.kr/www/government/news/press?idx=664905&mode=view",
    });
  });
});

describe("gangjin parseDetailBody", () => {
  it("og 상세 제목과 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("강진군 “대상포진 걱정 마”");
    expect(body).toContain("군민 건강 보호");
  });
});
