import { describe, expect, it } from "vitest";
import { parseNewsList } from "@/lib/news-collectors/korea-kr-topics";

describe("korea.kr topics parser", () => {
  it("parses current policy/visual keyword-news links", () => {
    const html = `
      <div class="rediscover"><div class="list_type focus"><ul>
        <li>
          <a href="/multi/visualNewsView.do?newsId=148969847&amp;pWiseKeyword=keywordNews">
            <span class="thumb"><img src="https://www.korea.kr/newsWeb/resources/attaches/2026.08/11/card.jpg" alt="" /></span>
            <span class="text">
              <strong> 성장의 온기를 곳곳으로 전합니다 </strong>
              <span class="lead">전통시장 환경 개선과 소상공인 지원 내용을 안내합니다.</span>
              <span class="source"><span>2026.08.11</span><span>중소벤처기업부</span></span>
            </span>
          </a>
        </li>
        <li>
          <a href="/news/policyNewsView.do?newsId=148968619&amp;pWiseKeyword=keywordNews">
            <span class="thumb"><img src="https://www.korea.kr/newsWeb/resources/attaches/2026.07/22/photo.jpg" alt="" /></span>
            <span class="text">
              <strong> 정부, 예금토큰 민간 인프라 본격 확산 </strong>
              <span class="lead">소상공인 수수료 부담 완화 등 실질 성과를 창출합니다.</span>
              <span class="source"><span>2026.07.22</span><span>과학기술정보통신부</span></span>
            </span>
          </a>
        </li>
        <li>
          <a href="/news/customizedNewsView.do?newsId=148970016&amp;keyType=KW01">
            <span class="thumb"><img src="https://www.korea.kr/newsWeb/resources/attaches/2026.08/13/home.jpg" alt="" /></span>
            <span class="text">
              <strong><span class="category">청년·대학생</span> 수도권에 23만 호 추가 공급</strong>
              <span class="lead">청년 주거지원 3종 세트를 출시합니다.</span>
              <span class="source"><span>2026.08.13</span><span>국토교통부</span></span>
            </span>
          </a>
        </li>
      </ul></div></div>
    `;

    const items = parseNewsList(html);

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      newsId: "148969847",
      sourceUrl:
        "https://www.korea.kr/multi/visualNewsView.do?newsId=148969847&pWiseKeyword=keywordNews",
      title: "성장의 온기를 곳곳으로 전합니다",
      ministry: "중소벤처기업부",
      publishedAt: "2026-08-11T00:00:00.000Z",
    });
    expect(items[1]).toMatchObject({
      newsId: "148968619",
      sourceUrl:
        "https://www.korea.kr/news/policyNewsView.do?newsId=148968619&pWiseKeyword=keywordNews",
      ministry: "과학기술정보통신부",
      publishedAt: "2026-07-22T00:00:00.000Z",
    });
    expect(items[2]).toMatchObject({
      newsId: "148970016",
      sourceUrl: "https://www.korea.kr/news/customizedNewsView.do?newsId=148970016&keyType=KW01",
      title: "수도권에 23만 호 추가 공급",
      ministry: "국토교통부",
      publishedAt: "2026-08-13T00:00:00.000Z",
    });
  });
});
