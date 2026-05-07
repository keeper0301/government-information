import { describe, expect, it } from "vitest";
import {
  buildInstagramCaption,
  getLinkInBioText,
} from "@/lib/instagram/caption";

describe("buildInstagramCaption", () => {
  const baseInput = {
    title: "2026년 경기도 청년 기본소득 — 분기 25만원",
    meta_description: "만 24세 경기도 청년에게 분기별 25만원을 지급하는 기본소득 제도.",
    category: "청년",
    tags: ["청년", "기본소득", "경기도"],
    detailUrl: "https://www.keepioo.com/blog/2026-경기도-청년",
  };

  it("hook (제목) + 핵심 정보 (meta_description) 포함", () => {
    const caption = buildInstagramCaption(baseInput);
    expect(caption).toContain("📌 2026년 경기도 청년 기본소득");
    expect(caption).toContain("만 24세 경기도 청년에게 분기별 25만원");
  });

  it("프로필 링크 안내 포함 (인스타 캡션은 link 클릭 안 됨)", () => {
    const caption = buildInstagramCaption(baseInput);
    expect(caption).toContain("프로필 링크");
    expect(caption).toContain("keepioo.com");
  });

  it("카테고리별 해시태그 포함", () => {
    const caption = buildInstagramCaption(baseInput);
    expect(caption).toContain("#청년정책");
    expect(caption).toContain("#청년지원금");
  });

  it("공통 해시태그 (#정책알리미·#정부지원금) 포함", () => {
    const caption = buildInstagramCaption(baseInput);
    expect(caption).toContain("#정책알리미");
    expect(caption).toContain("#정부지원금");
  });

  it("사용자 tags → 해시태그로 변환 (공백·# 정리)", () => {
    const caption = buildInstagramCaption({
      ...baseInput,
      tags: ["청년", " 기본 소득 ", "#경기도"],
    });
    expect(caption).toContain("#기본소득");
    expect(caption).toContain("#경기도");
  });

  it("카테고리·tags 모두 null → 공통 해시태그만", () => {
    const caption = buildInstagramCaption({
      ...baseInput,
      category: null,
      tags: null,
    });
    expect(caption).toContain("#정책알리미");
    expect(caption).not.toContain("#청년정책");
  });

  it("매핑 안 된 카테고리 → 공통 해시태그만", () => {
    const caption = buildInstagramCaption({ ...baseInput, category: "알수없음" });
    expect(caption).toContain("#정책알리미");
  });

  it("해시태그는 최대 12개로 제한 (인스타 권장)", () => {
    const caption = buildInstagramCaption({
      ...baseInput,
      tags: Array.from({ length: 30 }, (_, i) => `tag${i}`),
    });
    const hashtagLine = caption.split("\n").pop() ?? "";
    const tagCount = (hashtagLine.match(/#\S+/g) ?? []).length;
    expect(tagCount).toBeLessThanOrEqual(12);
  });

  it("meta_description null → 도입부 없이 hook 만", () => {
    const caption = buildInstagramCaption({ ...baseInput, meta_description: null });
    expect(caption).toContain("📌");
    expect(caption).toContain("프로필 링크");
  });
});

describe("getLinkInBioText", () => {
  it("keepioo URL 포함", () => {
    expect(getLinkInBioText()).toContain("https://www.keepioo.com");
  });
});
