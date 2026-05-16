// ============================================================
// 워드프레스 변환 단위 테스트
// ============================================================
// 핵심:
//   - WORDPRESS_CATEGORY_MAP keys ⟷ CATEGORY_COLORS keys 동기화 invariant.
//     누락 시 워드프레스 카테고리 "정책" silent fallback (사장님 분류 깨짐).
//   - convertToWordPress 의 백링크 footer + slug → URL 변환 회귀 방지
// ============================================================

import { describe, it, expect } from "vitest";
import {
  WORDPRESS_CATEGORY_MAP,
  convertToWordPress,
} from "@/lib/wordpress/format";
import { CATEGORY_COLORS } from "@/lib/instagram/card-colors";

// ── invariant: 카테고리 lookup 표 동기화 ───────────────────
describe("WORDPRESS_CATEGORY_MAP keys ⟷ CATEGORY_COLORS keys", () => {
  it("두 표의 keys 가 동일 집합", () => {
    const colorKeys = Object.keys(CATEGORY_COLORS).sort();
    const wpKeys = Object.keys(WORDPRESS_CATEGORY_MAP).sort();
    expect(wpKeys).toEqual(colorKeys);
  });

  it.each(Object.keys(CATEGORY_COLORS))(
    "'%s' 카테고리가 WORDPRESS_CATEGORY_MAP 에도 정의 (silent fallback 차단)",
    (cat) => {
      expect(WORDPRESS_CATEGORY_MAP[cat]).toBeDefined();
      expect(typeof WORDPRESS_CATEGORY_MAP[cat]).toBe("string");
      expect(WORDPRESS_CATEGORY_MAP[cat].length).toBeGreaterThan(0);
    },
  );
});

// ── convertToWordPress 기본 동작 ──────────────────────────
describe("convertToWordPress — 카테고리 매핑", () => {
  function makePost(category: string | null) {
    return {
      slug: "test-slug",
      title: "테스트 제목",
      meta_description: "테스트 요약",
      content: "<p>본문</p>",
      tags: ["태그1"],
      category,
    };
  }

  it("청년 카테고리 → 워드프레스 '청년' slug", () => {
    expect(convertToWordPress(makePost("청년")).categories).toEqual(["청년"]);
  });

  it("'육아·가족' → '육아가족' (중점 제거 매핑)", () => {
    expect(convertToWordPress(makePost("육아·가족")).categories).toEqual([
      "육아가족",
    ]);
  });

  it("'학생·교육' → '교육' (축약 매핑)", () => {
    expect(convertToWordPress(makePost("학생·교육")).categories).toEqual([
      "교육",
    ]);
  });

  it("null 카테고리 → '정책' fallback (블로그 작성 시 카테고리 누락 케이스)", () => {
    expect(convertToWordPress(makePost(null)).categories).toEqual(["정책"]);
  });

  it("알려지지 않은 카테고리 → '정책' fallback", () => {
    expect(convertToWordPress(makePost("이상한카테고리")).categories).toEqual(
      ["정책"],
    );
  });
});

// ── convertToWordPress 백링크 footer ──────────────────────
describe("convertToWordPress — 백링크 footer", () => {
  it("slug 가 백링크 URL 에 그대로 포함", () => {
    const out = convertToWordPress({
      slug: "test-policy-2026",
      title: "T",
      meta_description: "M",
      content: "<p>본문</p>",
      tags: [],
      category: "청년",
    });
    expect(out.content).toContain(
      "https://www.keepioo.com/blog/test-policy-2026",
    );
  });

  it("rel=canonical 백링크 포함 (SEO 핵심)", () => {
    const out = convertToWordPress({
      slug: "x",
      title: "T",
      meta_description: null,
      content: "<p>본문</p>",
      tags: [],
      category: null,
    });
    expect(out.content).toContain('rel="canonical"');
  });

  it("recommend 페이지 link 도 포함", () => {
    const out = convertToWordPress({
      slug: "x",
      title: "T",
      meta_description: null,
      content: "<p>본문</p>",
      tags: [],
      category: null,
    });
    expect(out.content).toContain("https://www.keepioo.com/recommend");
  });
});

// ── convertToWordPress 기본 필드 ──────────────────────────
describe("convertToWordPress — 기본 필드", () => {
  it("status='publish' 즉시 발행", () => {
    const out = convertToWordPress({
      slug: "x",
      title: "T",
      meta_description: null,
      content: "<p>본문</p>",
      tags: [],
      category: null,
    });
    expect(out.status).toBe("publish");
  });

  it("meta_description 없으면 title 이 excerpt fallback", () => {
    const out = convertToWordPress({
      slug: "x",
      title: "fallback 제목",
      meta_description: null,
      content: "<p>본문</p>",
      tags: [],
      category: null,
    });
    expect(out.excerpt).toBe("fallback 제목");
  });

  it("tags null → 빈 배열", () => {
    const out = convertToWordPress({
      slug: "x",
      title: "T",
      meta_description: null,
      content: "<p>본문</p>",
      tags: null,
      category: null,
    });
    expect(out.tags).toEqual([]);
  });
});
