// asan parser 회귀 방어. 아산시 미디어 뉴스의
// swiper-slide 목록과 article_con 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/asan";

const MOCK_LIST_HTML = `
<ul class="swiper-wrapper">
  <li class="swiper-slide">
    <div class="txt_area">
      <p>아산시, 일상부터 비즈니스까지 ‘2026 AI 실무 활용 과정’ 수강생 모집</p>
      <span>아산시평생학습관이 시민들의 디지털 역량을 강화하고 실무 능력을 높이기 위해 과정을 운영한다.</span>
      <div class="ele_info"><em>2026.07.21 화요일</em><em class="hits">31</em></div>
    </div>
    <a href='?m_mode=view&pds_no=2026072106175028048&PageNo=1&cate=news'>자세히보기</a>
  </li>
</ul>
`;

const MOCK_DETAIL_HTML = `
<div class="article_ttl">
  <p>아산시, 일상부터 비즈니스까지 ‘2026 AI 실무 활용 과정’ 수강생 모집</p>
  <div class="info">
    <span>평생학습과</span>
    <span>041-537-3907</span>
    <span>2026.07.21</span>
  </div>
</div>
<div class="article_body">
  <div class="article_con">
    <p><span>아산시평생학습관이 시민들의 디지털 역량을 강화하고 실무 능력을 높이기 위해 오는 29일부터 6주간 2026 AI 실무 활용 과정을 운영한다.</span></p>
    <p><span>이번 교육은 일상생활, 업무, 창의적 작업 등 다양한 영역에서 효과적으로 AI 기술을 활용할 수 있도록 지원하기 위해 마련됐다.</span></p>
    <p><span>단순한 이론 교육을 벗어나 영상, 이미지, 텍스트 등 관심 분야별 AI 도구를 직접 다뤄보는 실무 중심의 맞춤형 학습으로 진행된다.</span></p>
    <p><span>교육 대상은 직장인, 평생교육강사, 신중년, 예비창업자 등 AI 활용에 관심이 있는 아산시민이면 누구나 참여할 수 있다.</span></p>
    <p><span>평생학습관 관계자는 시민들이 실생활과 업무에서 AI를 자유롭게 활용할 수 있도록 실무 중심으로 알차게 구성했다고 전했다.</span></p>
  </div>
</div>
`;

describe("asan parseListPage", () => {
  it("swiper-slide 목록에서 pds_no, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "2026072106175028048",
      title: "아산시, 일상부터 비즈니스까지 ‘2026 AI 실무 활용 과정’ 수강생 모집",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://media.asan.go.kr/develop/m_news/?m_mode=view&pds_no=2026072106175028048&PageNo=1&cate=news",
    });
  });
});

describe("asan parseDetailBody", () => {
  it("article_con 상세 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("아산시평생학습관");
    expect(body).toContain("실무 중심");
  });
});
