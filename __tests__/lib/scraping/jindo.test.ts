// jindo parser 회귀 방어. 진도군청 공식 군정소식의
// news_list 목록과 board_view 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/jindo";

const MOCK_LIST_HTML = `
<ul class="news_list">
  <li class="thumb_news"><a href="?act=read&amp;articleId=193475&amp;categoryId=0&amp;m=626&amp;searchCondition=&amp;searchKeyword=&amp;pageIndex=1">
    <em class="news_tit">
      <span class="styCategory">[생활/안전]</span> 이재각 진도군수, 폭염 속 현장 근로자 안전 최우선 강조<span class="inew"><img src="/themes/home/images/content/bbs_ico_new.png" alt="new" /></span></em>
    <span class="news_inner">
      <span class="news_thumb">
        <img src="/uploads/board/2026/07/202607230111100570.JPG" alt="이재각 진도군수, 폭염 속 현장 근로자 안전 최우선 강조 이미지"></span>
      <span class="news_txt">이재각 진도군수, 폭염 속 현장 근로자 안전 최우선 강조 공원관리사업소 방문해 기간제근로자 76명 격려</span>
    </span>
    <span class="news_info"><!--기획홍보실 | //-->작성일 : 2026-07-23</span>
    <span class="news_read">조회수 : 63</span>
  </a></li><!-- // news_item -->
  <li class="thumb_news"><a href="?act=read&amp;articleId=193474&amp;categoryId=0&amp;m=626&amp;searchCondition=&amp;searchKeyword=&amp;pageIndex=1">
    <em class="news_tit">
      <span class="styCategory">[보건/복지]</span> 진도군 드림스타트, ‘단기 스포츠 체험 강좌’ 성료<span class="inew"><img src="/themes/home/images/content/bbs_ico_new.png" alt="new" /></span></em>
    <span class="news_inner"><span class="news_txt">건강한 신체활동을 통해 아동들의 협동심 키워</span></span>
    <span class="news_info">작성일 : 2026-07-23</span>
    <span class="news_read">조회수 : 61</span>
  </a></li><!-- // news_item -->
</ul>
`;

const MOCK_DETAIL_HTML = `
<p class="table_unit">작성일:<em>2026-07-23 13:11</em></p>
<div class="board_view">
  <dl class="view_head">
    <dt>
      <em class="tit">제목</em>
      <span class="txt">이재각 진도군수, 폭염 속 현장 근로자 안전 최우선 강조</span>
    </dt>
  </dl>
  <div class="view_body">
    <p class="img"><img src="/uploads/board/2026/07/sample.JPG" alt="첨부#1" /></p>
    <p class="txt">
      <span style="word-break:keep-all"><span style="font-size:20.0pt"><span style="font-family:함초롬바탕"><span style="font-weight:bold">이재각 진도군수</span></span></span><span lang="EN-US">, </span><span style="font-weight:bold">폭염 속 현장 근로자 안전 최우선 강조</span></span><br />
      <span>공원관리사업소 방문해 기간제근로자 76명 격려… 폭염 대응 안전관리 강화</span><br />
      <span>생활권 녹지공간 확충과 사계절 아름다운 경관 조성 당부</span><br /><br />
      <span>이재각 진도군수는 지난 20일 공원관리사업소를 방문해 주요 업무를 보고받고 직원들을 격려하는 한편, 공원관리 현장에서 근무하는 기간제근로자 76명을 만나 폭염 대응과 안전관리를 강조하며 현장 중심의 소통 행정을 펼쳤다.</span><br /><br />
      <span>이 군수는 이날 업무보고에서 생활권 녹지공간을 지속적으로 확충하고 숲과 공원이 군민 생활 안전망 역할을 할 수 있도록 세심하게 관리해 달라고 당부했다. 군은 폭염 취약 작업장을 수시로 점검하고 휴식시간 보장, 식수 제공, 안전교육 강화 등 근로자 보호대책을 이어갈 계획이다.</span>
    </p>
  </div>
</div>
<form name="boardListForm"></form>
`;

describe("jindo parseListPage", () => {
  it("news_list 항목에서 articleId, 제목, 작성일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: "193475",
      title: "이재각 진도군수, 폭염 속 현장 근로자 안전 최우선 강조",
      publishedDate: "2026-07-23",
      sourceUrl:
        "https://jindo.go.kr/home/board/B0016.cs?act=read&articleId=193475&categoryId=0&m=626&searchCondition=&searchKeyword=&pageIndex=1",
    });
    expect(items[1]).toMatchObject({
      seq: "193474",
      title: "진도군 드림스타트, ‘단기 스포츠 체험 강좌’ 성료",
      publishedDate: "2026-07-23",
    });
  });
});

describe("jindo parseDetailBody", () => {
  it("board_view 상세 제목과 본문을 추출하고 이미지 alt 노이즈를 제외한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("폭염 대응 안전관리 강화");
    expect(body).toContain("근로자 보호대책");
    expect(body).not.toContain("sample.JPG");
    expect(body).not.toContain("첨부#1");
  });
});
