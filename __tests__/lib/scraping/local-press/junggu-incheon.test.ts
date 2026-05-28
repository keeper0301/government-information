import { describe, expect, it } from "vitest";
import {
  parseDetailBody,
  parseListPage,
} from "@/lib/scraping/local-press/junggu_incheon";

describe("인천 중구 목록 해석", () => {
  it("글 번호, 제목, 제공일자를 목록에서 뽑는다", () => {
    const html = `
      <li>
        <a href="/krop0231c/285680">
          <div class="txt-area">
            <strong class="subject">인천 중구, 청년 인재 양성 돌입</strong>
            <div class="board-item-area">
              <dl class="item">
                <dt>제공일자</dt>
                <dd>2026-05-27</dd>
              </dl>
            </div>
          </div>
        </a>
      </li>
    `;

    const items = parseListPage(html);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      seq: "285680",
      title: "인천 중구, 청년 인재 양성 돌입",
      publishedDate: "2026-05-27",
      sourceUrl: "https://www.icjg.go.kr/krop0231c/285680",
    });
  });

  it("같은 글 번호는 한 번만 남긴다", () => {
    const row = `
      <a href="/krop0231c/285680">
        <strong class="subject">인천 중구, 청년 인재 양성 돌입</strong>
        <dt>제공일자</dt><dd>2026-05-27</dd>
      </a>
    `;

    expect(parseListPage(row + row)).toHaveLength(1);
  });
});

describe("인천 중구 본문 해석", () => {
  it("상세 본문에서 안내 문구와 버튼 영역을 빼고 본문만 뽑는다", () => {
    const html = `
      <div class="board-view-contents">
        <p>인천 중구는 관내 미취업 청년에게 공항 특화 전문 교육 기회를 제공한다고 밝혔다.</p>
        <p>이번 과정은 보안검색 및 항공경비 직무 역량을 높이기 위해 마련됐다.</p>
        <img src="/sample.jpg" alt="image">
      </div>
      <div class="btn-set text-align-right">
        <a href="/krop0231c">목록</a>
      </div>
    `;

    const body = parseDetailBody(html);

    expect(body).toContain("공항 특화 전문 교육");
    expect(body).toContain("항공경비 직무 역량");
    expect(body).not.toContain("목록");
  });

  it("본문 영역이 없으면 null을 돌려준다", () => {
    expect(parseDetailBody("<main>인천 중구 본문</main>")).toBeNull();
  });
});
