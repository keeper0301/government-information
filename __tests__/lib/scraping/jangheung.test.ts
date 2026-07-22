// jangheung parser 회귀 방어. 장흥군청 공식 장흥소식의
// card 목록과 og 상세 본문을 검증한다.

import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/jangheung";

const MOCK_LIST_HTML = `
<div class="card_list col1">
  <div class="card">
    <div class="card_body">
      <div class="img"></div>
      <div class="sum">
        <span class="tit"><span><a href="/www/organization/news/jh_news?idx=376580&amp;mode=view" title="장흥지역자활센터, 광주지방법원 장흥지원 광주회생법원과 함께 사회적 약자 지원 나서">장흥지역자활센터, 광주지방법원 장흥지원 광주회생법원과 함께 사회적 약자 지원 나서</a></span></span>
        <span class="sub web_only">개인회생·개인파산 등 채무조정제 안내....경제적 재기와 자립 지원</span>
        <span class="exp"><span>2026-07-21<i class="ico_new itid"></i></span><span>인터넷리포터</span><span class="web_only">조회수 80</span></span>
      </div>
    </div>
    <div class="card_foot"></div>
  </div>
</div>
`;

const MOCK_DETAIL_HTML = `
<head>
  <title>장흥지역자활센터, 광주지방법원 장흥지원 광주회생법원과 함께 사회적 약자 지원 나서  &lt; 장흥소식 &lt; 새소식 &lt; 군정정보 - 장흥군청</title>
  <meta property="og:title" content="장흥지역자활센터, 광주지방법원 장흥지원 광주회생법원과 함께 사회적 약자 지원 나서" />
  <meta property="og:description" content="개인회생·개인파산 등 채무조정제 안내....경제적 재기와 자립 지원

장흥지역자활센터는 광주지방법원·광주가정법원 장흥지원, 광주회생법원, 신용회복위원회와 함께 자활근로 참여주민 및 장흥·강진 지역 주민을 대상으로 개인채무조정제도 설명회를 개최했다고 밝혔다.

이번 설명회는 경제적·사회적으로 어려움을 겪는 주민들의 법률서비스 접근성을 높이고, 개인회생·개인파산 등 채무조정제도를 쉽게 이해할 수 있도록 안내하여 경제적 재기와 안정적인 자립을 돕기 위해 마련됐다.

이날 행사에는 광주지방법원·광주가정법원 장흥지원, 광주회생법원, 신용회복위원회 관계자들이 참석했다. 광주회생법원 고준홍 판사와 신용회복위원회 최성훈 선임 심사역은 개인회생, 개인파산, 신용회복절차 등 채무조정제도를 설명했다." />
</head>
`;

describe("jangheung parseListPage", () => {
  it("장흥소식 목록에서 idx, 제목, 등록일을 추출한다", () => {
    const items = parseListPage(MOCK_LIST_HTML);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "376580",
      title:
        "장흥지역자활센터, 광주지방법원 장흥지원 광주회생법원과 함께 사회적 약자 지원 나서",
      publishedDate: "2026-07-21",
      sourceUrl:
        "https://www.jangheung.go.kr/www/organization/news/jh_news?idx=376580&mode=view",
    });
  });
});

describe("jangheung parseDetailBody", () => {
  it("og 상세 제목과 본문을 추출한다", () => {
    const body = parseDetailBody(MOCK_DETAIL_HTML);

    expect(body).not.toBeNull();
    expect(body!.length).toBeGreaterThanOrEqual(250);
    expect(body).toContain("장흥지역자활센터");
    expect(body).toContain("개인채무조정제도 설명회");
  });
});
