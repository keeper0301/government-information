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
    expect(caption).toContain("저장해두고 다시 확인");
    expect(caption).toContain("만 24세 경기도 청년에게 분기별 25만원");
  });

  it("프로필 링크 안내 포함 (인스타 캡션은 link 클릭 안 됨)", () => {
    const caption = buildInstagramCaption(baseInput);
    expect(caption).toContain("프로필 링크");
    expect(caption).toContain("keepioo.com");
    expect(caption).toContain("keepioo에서");
    expect(caption).toContain("검색");
  });

  it("정책 정보 안전 체크리스트와 변동 가능성 안내 포함", () => {
    const caption = buildInstagramCaption(baseInput);
    expect(caption).toContain("대상·소득 기준·신청 기간·제출 서류");
    expect(caption).toContain("지역·소득·마감일에 따라 달라질 수");
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

  it("Instagram 발행 표면의 저가 클릭 유도 문구를 정책 브랜드형으로 정리", () => {
    const caption = buildInstagramCaption({
      ...baseInput,
      title: "2026년 인천 블록체인 도입 컨설팅 중소기업 성장 기회 놓치면 후회",
      meta_description: "마감부터 봐야 해요. 바로가기 👇👇",
    });

    expect(caption).toContain("📌 2026년 인천 블록체인 도입 컨설팅 중소기업 지원 내용 확인");
    expect(caption).toContain("신청 기간을 먼저 확인하세요");
    expect(caption).toContain("공식 신청처 확인");
    expect(caption).not.toContain("놓치면 후회");
    expect(caption).not.toContain("바로가기 👇");
  });

  // 2026-06-13 오탐 회귀 방어 — 정책 제목(고유명사)에 금지 문구가 들어가도 발행 차단되면 안 됨.
  // (6/8 "청년과 함께 성장할 기업 모집" 글이 금지구 "함께 성장" 으로 매번 검증 실패 → 영영 미발행 사고)
  it("제목에 금지 문구(함께 성장)가 있어도 throw 안 함 (인용된 정책명 면제)", () => {
    const input = {
      ...baseInput,
      title: "2026년 중소기업 미래내일 일경험 — 청년과 함께 성장할 기업 모집",
      meta_description:
        "청년 일경험 기회를 제공할 중소기업을 모집하는 정부 지원 사업.",
    };
    expect(() => buildInstagramCaption(input)).not.toThrow();
    const caption = buildInstagramCaption(input);
    expect(caption).toContain("함께 성장할 기업"); // 제목은 그대로 인용 유지
  });

  // 제목 면제가 meta_description(자체 문체) 검증까지 무력화하면 안 됨 — 진짜 금지 문구는 여전히 차단.
  it("meta_description 에 든 금지 문구는 여전히 throw (자체 문체 검증 유지)", () => {
    const input = {
      ...baseInput,
      title: "2026년 경기도 청년 기본소득 — 분기 25만원",
      meta_description: "여러분 이번 글에서는 청년 기본소득을 소개합니다.",
    };
    expect(() => buildInstagramCaption(input)).toThrow();
  });
});

describe("getLinkInBioText", () => {
  it("keepioo URL 포함", () => {
    expect(getLinkInBioText()).toContain("https://www.keepioo.com");
  });
});
