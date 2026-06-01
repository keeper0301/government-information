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

// 2026-06-02 — 본문 소스를 JSON-LD(NewsArticle.articleBody)로 교체(구 div 컨테이너 0건 회귀).
const ld = (obj: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

describe("parseDetailBody (JSON-LD articleBody)", () => {
  it("NewsArticle articleBody 에서 본문을 뽑는다", () => {
    const html = ld({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: "서울시 정책",
      articleBody:
        "서울특별시는 시민 안전을 위한 새로운 정책을 발표했다고 밝혔다. 이 정책은 만 40세 이상 누구나 신청할 수 있으며 자세한 내용은 시청 누리집에서 확인할 수 있다.",
    });
    const body = parseDetailBody(html);
    expect(body).toContain("서울특별시");
    expect(body).toContain("신청할 수 있");
  });

  it("@graph 배열 안 NewsArticle 도 인식한다", () => {
    const html = ld({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite" },
        {
          "@type": "NewsArticle",
          articleBody:
            "서울시는 청년 주거 지원 사업을 확대한다고 발표했다. 신청 자격과 절차는 자치구별로 안내되며 누구나 온라인으로 접수할 수 있다.",
        },
      ],
    });
    expect(parseDetailBody(html)).toContain("청년 주거");
  });

  it("HTML entity 를 풀어서 출력한다", () => {
    const html = ld({
      "@type": "NewsArticle",
      articleBody:
        "한국어 본문 &quot;테스트&quot; &amp;시작합니다. 충분히 긴 본문으로 50자 임계를 통과하도록 작성한 서울시 보도자료 예시 문장입니다.",
    });
    const body = parseDetailBody(html);
    expect(body).toContain('"테스트"');
    expect(body).toContain("&시작");
  });

  it("깨진 JSON-LD 블록은 건너뛰고 유효 블록을 쓴다", () => {
    const html = `
      <script type="application/ld+json">{ 깨진 JSON 입니다 }</script>
      ${ld({
        "@type": "NewsArticle",
        articleBody:
          "서울특별시가 폭염 대비 무더위쉼터를 확대 운영한다고 밝혔다. 자세한 위치는 누리집에서 확인할 수 있으며 누구나 이용 가능하다.",
      })}`;
    expect(parseDetailBody(html)).toContain("무더위쉼터");
  });

  it("JSON-LD 가 없으면 null", () => {
    expect(
      parseDetailBody(`<div class="view_content"><p>본문 한국어입니다</p></div>`),
    ).toBeNull();
  });

  it("articleBody 없는 다른 schema 는 null", () => {
    expect(parseDetailBody(ld({ "@type": "WebPage", name: "서울" }))).toBeNull();
  });

  it("articleBody 에 한국어가 없으면 null", () => {
    const html = ld({
      "@type": "NewsArticle",
      articleBody: "EVENT 2026 ABCD efgh ijkl mnop qrst uvwx 12345 67890 schedule",
    });
    expect(parseDetailBody(html)).toBeNull();
  });

  it("20,000자 초과 본문은 20,000자에서 잘린다", () => {
    const longText = "한" + "가나다라마바사아자차카타파하".repeat(2000);
    const body = parseDetailBody(ld({ "@type": "NewsArticle", articleBody: longText }));
    expect(body).not.toBeNull();
    expect(body!.length).toBeLessThanOrEqual(20000);
  });
});
