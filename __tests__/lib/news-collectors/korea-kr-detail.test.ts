// ============================================================
// korea.kr 상세 본문 스크래핑 helper 단위 테스트
// ============================================================
// 2026-06-02 — RSS 요약 → 상세 전문 보강. selector/정제 silent 회귀 방어.

import { describe, it, expect } from "vitest";
import {
  cleanDetailBody,
  parseDetailBodyHtml,
} from "@/lib/news-collectors/korea-kr-detail";

const 긴본문 =
  "문화체육관광부는 6월 1일부터 30일까지 녹색소비주간을 운영한다고 밝혔다. 이번 주간에는 녹색제품을 " +
  "구매하는 소비자에게 최대 50퍼센트 할인과 100원 특가 혜택을 제공한다. 부는 친환경 소비 문화를 확산하고 " +
  "탄소중립 실천을 유도하기 위해 다양한 참여 행사를 마련했다. 전국 주요 백화점과 대형마트, 온라인 쇼핑몰이 " +
  "참여하며, 소비자는 녹색제품 인증 마크가 부착된 상품을 구매하면 혜택을 받을 수 있다. 부 관계자는 작은 " +
  "실천이 모여 큰 변화를 만든다며 시민들의 적극적인 참여를 당부했다.";

describe("korea-kr-detail parseDetailBodyHtml", () => {
  it("article_body 중첩 div depth 본문 추출", () => {
    const html = `<div class="article_body"><div class="inner"><p>${긴본문}</p></div></div>`;
    const body = parseDetailBodyHtml(html);
    expect(body).toContain("문화체육관광부");
    expect((body ?? "").length).toBeGreaterThanOrEqual(250);
  });

  it("view_cont fallback (article_body 없을 때)", () => {
    const html = `<div class="view_cont"><p>${긴본문}</p></div>`;
    expect(parseDetailBodyHtml(html)).toContain("녹색소비주간");
  });

  it("article_body 가 더 포괄(우선)", () => {
    // 실제 korea.kr: view_cont(짧음) + article_body(전문) 공존 케이스. article_body 우선.
    const html = `
      <div class="view_cont"><p>짧은 일부만</p></div>
      <div class="article_body"><p>${긴본문}</p></div>`;
    const body = parseDetailBodyHtml(html);
    expect(body).toContain("탄소중립");
  });

  it("figure·슬라이더·Previous/Next 잡음 제거", () => {
    const html = `<div class="article_body">
      <figure><img src="/x.jpg"/><figcaption>이미지캡션잡음</figcaption></figure>
      <div class="swiper">Previous Next 슬라이드캡션반복</div>
      <button>Next</button>
      <p>${긴본문}</p></div>`;
    const body = parseDetailBodyHtml(html);
    expect(body).toContain("문화체육관광부");
    expect(body).not.toContain("이미지캡션잡음"); // figure 제거
    expect(body).not.toContain("슬라이드캡션반복"); // swiper 제거
    expect(body).not.toContain("Previous");
    expect(body).not.toContain("Next");
  });

  it("250자 미만 → null (RSS 요약 유지)", () => {
    expect(
      parseDetailBodyHtml(`<div class="article_body"><p>녹색소비주간 짧은 안내</p></div>`),
    ).toBeNull();
  });

  it("본문 컨테이너 없음 → null", () => {
    expect(parseDetailBodyHtml(`<div class="other"><p>${긴본문}</p></div>`)).toBeNull();
  });
});

describe("korea-kr-detail cleanDetailBody", () => {
  it("HTML entity 디코딩 + 태그 제거", () => {
    const raw = `<p>부산시 &quot;녹색&quot; 소비 &amp; 친환경 정책을 추진한다.</p>`;
    const out = cleanDetailBody(raw);
    expect(out).toContain('"녹색"');
    expect(out).toContain("소비 & 친환경");
    expect(out).not.toContain("<p>");
  });
});
