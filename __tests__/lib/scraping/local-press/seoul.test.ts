// ============================================================
// seoul.ts parseListPage + parseDetailBody 단위 테스트
// ============================================================
// 2026-05-26 RSS 재작성 (commit 293eaf6) 후 옛 HTML 테이블 가정으로
// 사전 회귀. 새 RSS 입력 + 새 본문 컨테이너 클래스 (view_content 등) 로 재작성.
// ============================================================

import { describe, it, expect } from "vitest";
import { parseListPage, parseDetailBody } from "@/lib/scraping/local-press/seoul";

describe("parseListPage (RSS)", () => {
  it("RSS item 2개를 seq·title·날짜·URL 로 매핑한다", () => {
    const xml = `
      <rss>
        <channel>
          <item>
            <title>[제안요청서 사전공개] 2026년 S-Map 기능개선 용역</title>
            <link>https://news.seoul.go.kr/gov/archives/578160</link>
            <pubDate>2026-05-22 16:38:15</pubDate>
            <description>본문 일부</description>
          </item>
          <item>
            <title>제8차 도시건축 공동위원회 개최</title>
            <link>https://news.seoul.go.kr/gov/archives/578161</link>
            <pubDate>2026-05-21 09:00:00</pubDate>
            <description>회의 안내</description>
          </item>
        </channel>
      </rss>
    `;
    const items = parseListPage(xml);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      seq: "578160",
      title: "[제안요청서 사전공개] 2026년 S-Map 기능개선 용역",
      publishedDate: "2026-05-22",
      sourceUrl: "https://news.seoul.go.kr/gov/archives/578160",
    });
    expect(items[1]).toMatchObject({
      seq: "578161",
      publishedDate: "2026-05-21",
    });
  });

  it("같은 seq 가 두 번 들어오면 한 번만 남긴다", () => {
    const xml = `
      <rss><channel>
        <item>
          <title>같은 글이 두 번 노출되는 경우</title>
          <link>https://news.seoul.go.kr/gov/archives/100</link>
          <pubDate>2026-05-22 10:00:00</pubDate>
        </item>
        <item>
          <title>같은 글이 두 번 노출되는 경우</title>
          <link>https://news.seoul.go.kr/gov/archives/100</link>
          <pubDate>2026-05-22 10:00:00</pubDate>
        </item>
      </channel></rss>
    `;
    expect(parseListPage(xml)).toHaveLength(1);
  });

  it("CDATA 로 감싼 제목도 본문 텍스트로 풀어낸다", () => {
    const xml = `
      <rss><channel>
        <item>
          <title><![CDATA[서울특별시, 청년 정책 발표]]></title>
          <link>https://news.seoul.go.kr/gov/archives/200</link>
          <pubDate>2026-05-22 10:00:00</pubDate>
        </item>
      </channel></rss>
    `;
    const items = parseListPage(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("서울특별시, 청년 정책 발표");
  });

  it("link 없는 item, archives 가 아닌 link, 한국어 없는 title 은 모두 건너뛴다", () => {
    const xml = `
      <rss><channel>
        <item>
          <title>제목만 있고 link 없음</title>
          <pubDate>2026-05-22 10:00:00</pubDate>
        </item>
        <item>
          <title>archives 가 아닌 다른 경로</title>
          <link>https://news.seoul.go.kr/gov/other/300</link>
          <pubDate>2026-05-22 10:00:00</pubDate>
        </item>
        <item>
          <title>ENG ONLY TITLE 12345</title>
          <link>https://news.seoul.go.kr/gov/archives/400</link>
          <pubDate>2026-05-22 10:00:00</pubDate>
        </item>
      </channel></rss>
    `;
    expect(parseListPage(xml)).toEqual([]);
  });

  it("빈 XML 은 빈 배열을 돌려준다", () => {
    expect(parseListPage("")).toEqual([]);
  });
});

describe("parseDetailBody", () => {
  it("view_content 컨테이너에서 한국어 본문을 뽑는다", () => {
    const html = `
      <div class="view_content">
        <p>○ 학습역량과 학습태도 역시 서울런 활용도가 높은 집단에서 각각 84점, 86점으로 나타났다.</p>
        <p>○ 또 예체능 진학 희망자를 위한 대학연계 특화 프로그램과 소통 전문가 강연을 운영한다.</p>
      </div>
      <div class="btn-set"><a>목록</a></div>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("서울런");
    expect(body).toContain("대학연계");
  });

  it("entry-content 컨테이너 도 본문으로 인식한다", () => {
    const html = `
      <div class="entry-content">
        <p>서울특별시는 시민 안전을 위한 새로운 정책을 발표했다고 밝혔다. 이 정책은 누구나 신청할 수 있다.</p>
      </div>
      <section><a>다음 글</a></section>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain("서울특별시");
    expect(body).toContain("정책을 발표");
  });

  it("HTML entity 를 풀어서 출력한다", () => {
    const html = `
      <div class="board_view">
        <p>한국어 본문 &nbsp;&quot;테스트&quot; &amp;시작합니다 — 충분히 긴 본문으로 50자 임계를 통과해야 합니다.</p>
      </div>
      <section>끝</section>
    `;
    const body = parseDetailBody(html);
    expect(body).toContain('"테스트"');
    expect(body).toContain("&시작");
  });

  it("본문 컨테이너가 없으면 null 을 돌려준다", () => {
    const html = `
      <iframe id="pdf" src="/blank.php"></iframe>
      <p>element-invisible 안내</p>
    `;
    expect(parseDetailBody(html)).toBeNull();
  });

  it("컨테이너 안에 한국어가 한 글자도 없으면 null", () => {
    const html = `
      <div class="view_content">
        <p>2026-05-14 EVENT_CODE_12345 ABCD efgh ijkl mnop qrst uvwx yz12 3456 7890</p>
        <div class="btn">목록 버튼</div>
    `;
    expect(parseDetailBody(html)).toBeNull();
  });

  it("5,000자 초과 본문은 5,000자에서 잘린다", () => {
    const longText = "한" + "가나다라마바사아자차카타파하".repeat(500); // 약 6,500자
    const html = `
      <div class="view_content"><p>${longText}</p></div>
      <section>끝</section>
    `;
    const body = parseDetailBody(html);
    expect(body).not.toBeNull();
    expect(body!.length).toBeLessThanOrEqual(5000);
  });
});
