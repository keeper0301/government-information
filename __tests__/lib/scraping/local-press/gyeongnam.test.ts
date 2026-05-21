import { describe, expect, it } from "vitest";
import { parseDetailBody } from "@/lib/scraping/local-press/gyeongnam";

const enoughBody =
  "경남도청 보도자료 본문은 정책 안내와 신청 정보를 충분히 담고 있습니다. ".repeat(4);

describe("경남 수집기 본문 추출", () => {
  it("현재 se-contents 본문 구조를 추출", () => {
    const html = `
      <article>
        <div class="se-contents">
          <p>${enoughBody}</p>
        </div>
        <div class="basicView__file">첨부파일</div>
      </article>
    `;

    expect(parseDetailBody(html)).toContain("경남도청 보도자료 본문");
  });

  it("예전 bbs_view 본문 구조도 유지", () => {
    const html = `<div class="bbs_view"><p>${enoughBody}</p></div><div></div>`;

    expect(parseDetailBody(html)).toContain("정책 안내와 신청 정보");
  });
});
