// ============================================================
// lib/news/slug-helpers.ts unit tests (2026-05-22)
// ============================================================
// 5/22 audit 사고 (27개 collector silent fail) 회귀 방지.
// helper 가 결정적 + collision 가능성 ~0 보장.
// ============================================================

import { describe, expect, it } from "vitest";
import {
  makeNewsSourceId,
  makeNewsSlug,
} from "@/lib/news/slug-helpers";

describe("makeNewsSourceId", () => {
  it("결정적 — 같은 url 은 항상 같은 id", () => {
    const url = "https://www.changwon.go.kr/cwportal/12345.web";
    const a = makeNewsSourceId(url);
    const b = makeNewsSourceId(url);
    expect(a).toBe(b);
  });

  it("16자 hex 형식", () => {
    const id = makeNewsSourceId("https://example.com/test");
    expect(id).toMatch(/^[a-f0-9]{16}$/);
  });

  it("다른 url 은 다른 id (sha256 collision ~0)", () => {
    const a = makeNewsSourceId("https://www.bucheon.go.kr/a/1");
    const b = makeNewsSourceId("https://www.bucheon.go.kr/a/2");
    expect(a).not.toBe(b);
  });

  it("query string 차이도 다른 id", () => {
    const a = makeNewsSourceId("https://x.go.kr/list?seq=1");
    const b = makeNewsSourceId("https://x.go.kr/list?seq=2");
    expect(a).not.toBe(b);
  });
});

describe("makeNewsSlug", () => {
  it("결정적 — 같은 input 은 같은 slug", () => {
    const id = "abc1234567890def";
    const a = makeNewsSlug("창원시, 청년 일자리 확대", "changwon", id);
    const b = makeNewsSlug("창원시, 청년 일자리 확대", "changwon", id);
    expect(a).toBe(b);
  });

  it("title + cityKey + sourceId 결합", () => {
    const slug = makeNewsSlug("청년 일자리 확대", "suncheon", "abc1234567890def");
    expect(slug).toContain("청년");
    expect(slug).toContain("일자리");
    expect(slug).toContain("suncheon");
    expect(slug).toContain("abc1234567890def");
  });

  it("같은 title + 다른 cityKey 면 다른 slug — cross-city 충돌 방지", () => {
    const id = "abc1234567890def";
    const a = makeNewsSlug("정책 발표", "changwon", id);
    const b = makeNewsSlug("정책 발표", "seongnam", id);
    expect(a).not.toBe(b);
  });

  it("같은 title + 같은 cityKey 면서 다른 sourceId 면 다른 slug — 동일 시 내 다른 보도자료 충돌 방지", () => {
    const a = makeNewsSlug("정책 발표", "changwon", "abc1234567890def");
    const b = makeNewsSlug("정책 발표", "changwon", "9999999999999999");
    expect(a).not.toBe(b);
  });

  it("130자 이하로 truncate", () => {
    const longTitle = "가".repeat(200);
    const slug = makeNewsSlug(longTitle, "changwon", "abc1234567890def");
    expect(slug.length).toBeLessThanOrEqual(130);
  });

  it("특수문자 제거 + 공백 → 하이픈", () => {
    const slug = makeNewsSlug("[속보] 정책 발표!!", "changwon", "abc1234567890def");
    expect(slug).not.toMatch(/[\[\]!,]/);
    expect(slug).toContain("-");
  });
});
