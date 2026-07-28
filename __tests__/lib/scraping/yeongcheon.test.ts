// yeongcheon parser 회귀 방어. 영천 뉴스포털의
// bod_news_list top/list card + embedded body 구조를 검증한다.

import { describe, expect, it } from "vitest";
import { parseDetailBody, parseListItems } from "@/lib/scraping/local-press/yeongcheon";

describe("yeongcheon local press parser", () => {
  it("parses top/list news cards with goView ids and embedded bodies", () => {
    const html = `
      <div class="bod_news_list">
        <div class="top_news">
          <a href="#" onclick="goView('N', '29404'); return false;"><span class="title">영천예술창작스튜디오 18기 입주 작가, 시...</span></a>
          <p class="body"><span class="subject">영천시는 영천예술창작스튜디오 18기 입주 작가 특별전 GOOD PLACE를 개최한다. 이번 전시는 창작 성과를 지역사회와 공유하고 시민이 문화적 소통을 나누는 계기를 마련하기 위해 추진됐다. 참여 작가들은 회화와 설치 등 다양한 작품을 선보이며 시민에게 예술 향유 기회를 제공한다. 김병삼 영천시장은 시민들이 여름 전시장에서 예술의 즐거움을 느끼길 바란다고 말했다. 영천시는 앞으로도 지역 문화예술 활성화를 위해 다양한 전시와 시민 참여 프로그램을 지속적으로 지원할 계획이다.</span><span class="date"><em><b>작성일</b>2026.07.27</em></span></p>
        </div>
        <ul class="list"><li>
          <a href="#" onclick="goView('N', '29402'); return false;"><span class="title">9~18세 학교 밖 청소년 무료 건강검진 지원</span><span class="sub_title">영천시청소년상담복지센터에서 편하게 신청하세요</span></a>
          <p class="body"><span class="subject">영천시학교밖청소년지원센터는 관내 9세 이상 18세 이하 학교 밖 청소년의 건강한 성장을 지원하기 위해 학교 밖 청소년 무료 건강검진을 적극 지원한다고 밝혔다. 검진은 상담 및 진찰, 신체계측, 요검사, 혈액검사, 영상검사, 구강검진 등으로 구성되며 질병 조기 발견과 예방에 도움을 준다. 올해부터는 온라인 신청 절차도 간소화됐다. 센터는 대상 청소년에게 제도를 개별 안내하고 맞춤형 신청 지원을 이어갈 예정이다. 또한 위기 청소년이 필요한 건강 서비스를 놓치지 않도록 학교와 지역 기관 연계를 강화할 방침이다.</span><span class="date"><em><b>작성일</b>2026.07.27</em></span></p>
        </li></ul>
      </div>
    `;

    expect(parseListItems(html)).toEqual([
      expect.objectContaining({
        seq: "29404",
        title: "영천예술창작스튜디오 18기 입주 작가, 시",
        publishedDate: "2026-07-27",
        sourceUrl: "https://www.yc.go.kr/news/ycNews/list.do?searchCategory=1&mId=0200000000#ycnews-29404",
      }),
      expect.objectContaining({
        seq: "29402",
        title: "9~18세 학교 밖 청소년 무료 건강검진 지원 - 영천시청소년상담복지센터에서 편하게 신청하세요",
        publishedDate: "2026-07-27",
      }),
    ]);
  });

  it("parses an individual card body as detail body", () => {
    const html = `
      <li>
        <a href="#" onclick="goView('N', '29398'); return false;"><span class="title">영천시자원봉사센터, 환경교육 및 EM흙공 만들기</span></a>
        <p class="body"><span class="subject">영천시자원봉사센터는 센터 교육실에서 도담도담 가족봉사단이 참여한 가운데 환경교육과 EM흙공 만들기 활동을 실시했다. 이번 활동은 가족이 함께 환경의 중요성을 배우고 생활 속 친환경 실천을 확산하기 위해 마련됐다. 참가자들은 기후변화와 수질오염, 탄소중립 등 환경문제에 대한 교육을 받은 뒤 유용미생물을 활용한 흙공을 만들었다. 완성된 흙공은 발효 후 지역 하천에 투척해 수질 정화에 활용될 예정이다. 센터는 가족이 함께 배우고 실천하는 봉사활동을 지속적으로 운영하겠다고 밝혔다.</span><span class="date"><em><b>작성일</b>2026.07.27</em></span></p>
      </li>
    `;

    const parsed = parseDetailBody(html);
    expect(parsed).toContain("영천시자원봉사센터");
    expect(parsed).toContain("환경교육과 EM흙공 만들기");
    expect(parsed && parsed.length).toBeGreaterThan(250);
  });
});
