import { describe, expect, it } from "vitest";
import { convertToWordPress } from "@/lib/wordpress/format";

describe("convertToWordPress — keepioo 블로그 → 워드프레스 REST API payload", () => {
  const basePost = {
    slug: "2026-경기도-청년-기본소득",
    title: "2026년 경기도 청년 기본소득 — 분기 25만원 자격 1분 확인",
    meta_description: "만 24세 경기도 청년에게 분기별 25만원을 지급하는 기본소득 제도.",
    content:
      "<h2>이 정책은 무엇인가요?</h2><p><strong>경기도 청년 기본소득</strong>은 만 24세 청년에게 분기별 25만원을 지급합니다.</p>",
    tags: ["청년", "기본소득", "경기도"],
    category: "청년",
  };

  it("title·content·excerpt 기본 매핑 OK", () => {
    const out = convertToWordPress(basePost);
    expect(out.title).toBe(basePost.title);
    expect(out.content).toContain("경기도 청년 기본소득");
    expect(out.excerpt).toBe(basePost.meta_description);
  });

  it("status 는 publish (즉시 발행)", () => {
    const out = convertToWordPress(basePost);
    expect(out.status).toBe("publish");
  });

  it("백링크 footer 자동 추가 (keepioo 도메인 권위 핵심)", () => {
    const out = convertToWordPress(basePost);
    expect(out.content).toContain(
      "https://www.keepioo.com/blog/2026-경기도-청년-기본소득",
    );
    expect(out.content).toContain("https://www.keepioo.com/recommend");
    expect(out.content).toContain('rel="canonical"');
  });

  it("카테고리 매핑 — keepioo '청년' → wordpress '청년'", () => {
    const out = convertToWordPress(basePost);
    expect(out.categories).toContain("청년");
  });

  it("카테고리 '학생·교육' → wordpress slug '교육' 매핑", () => {
    const out = convertToWordPress({ ...basePost, category: "학생·교육" });
    expect(out.categories).toContain("교육");
  });

  it("카테고리 매핑 안 된 값 → '정책' fallback", () => {
    const out = convertToWordPress({ ...basePost, category: "알수없음" });
    expect(out.categories).toContain("정책");
  });

  it("카테고리 null → '정책' fallback", () => {
    const out = convertToWordPress({ ...basePost, category: null });
    expect(out.categories).toContain("정책");
  });

  it("tags 그대로 보존", () => {
    const out = convertToWordPress(basePost);
    expect(out.tags).toEqual(["청년", "기본소득", "경기도"]);
  });

  it("tags null → 빈 배열", () => {
    const out = convertToWordPress({ ...basePost, tags: null });
    expect(out.tags).toEqual([]);
  });

  it("meta_description null → title 을 excerpt 로 fallback", () => {
    const out = convertToWordPress({ ...basePost, meta_description: null });
    expect(out.excerpt).toBe(basePost.title);
  });

  it("HTML 본문은 그대로 유지 (워드프레스가 sanitize)", () => {
    const out = convertToWordPress(basePost);
    expect(out.content).toContain("<h2>");
    expect(out.content).toContain("<strong>");
  });
});
