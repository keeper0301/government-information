import { describe, expect, it } from "vitest";
import {
  normalizeTitleForDupe,
  groupCandidatesByTitle,
} from "@/lib/press-ingest/candidates";

describe("normalizeTitleForDupe", () => {
  it("공백·괄호·하이픈 제거 + lowercase + 8자 slice", () => {
    expect(normalizeTitleForDupe("고유가 피해지원금")).toBe("고유가피해지원금");
    expect(normalizeTitleForDupe("고유가 (피해) 지원금")).toBe("고유가피해지원금");
    expect(normalizeTitleForDupe("2026 경기도 예술인 기회소득")).toBe("2026경기도예");
  });

  it("8자 미만 title 도 정상 처리 (slice safe)", () => {
    expect(normalizeTitleForDupe("청년")).toBe("청년");
  });

  it("특수문자 모두 제거 — 동일 정책 다른 표기 매칭", () => {
    expect(normalizeTitleForDupe("청년·여성 - 창업[지원]")).toBe(
      normalizeTitleForDupe("청년 여성 창업 지원"),
    );
  });
});

describe("groupCandidatesByTitle", () => {
  it("동일 제목 4건 → 1 group, count=4", () => {
    const groups = groupCandidatesByTitle([
      { id: "a", title: "고유가 피해지원금" },
      { id: "b", title: "고유가 피해지원금" },
      { id: "c", title: "고유가(피해) 지원금" },
      { id: "d", title: "고유가 - 피해 지원금" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(4);
    expect(groups[0].ids).toHaveLength(4);
  });

  it("minGroupSize=2 default → 단일 후보 (count=1) 묶음 제외", () => {
    const groups = groupCandidatesByTitle([
      { id: "a", title: "고유가 피해지원금" },
      { id: "b", title: "고유가 피해지원금" },
      { id: "c", title: "전혀 다른 정책" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
  });

  it("count DESC 정렬 (큰 묶음 우선)", () => {
    const groups = groupCandidatesByTitle([
      { id: "a", title: "고유가 피해지원금" },
      { id: "b", title: "고유가 피해지원금" },
      { id: "c", title: "예술인 기회소득" },
      { id: "d", title: "예술인 기회소득" },
      { id: "e", title: "예술인 기회소득" },
    ]);
    expect(groups[0].count).toBe(3);
    expect(groups[1].count).toBe(2);
  });

  it("빈 title 또는 normalize 결과 0자 → 그룹화 제외", () => {
    const groups = groupCandidatesByTitle([
      { id: "a", title: "" },
      { id: "b", title: "   " },
      { id: "c", title: "정상 정책 제목" },
      { id: "d", title: "정상 정책 제목" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
  });

  it("minGroupSize=3 override → 2건 묶음 제외", () => {
    const groups = groupCandidatesByTitle(
      [
        { id: "a", title: "A 정책" },
        { id: "b", title: "A 정책" },
        { id: "c", title: "B 정책" },
        { id: "d", title: "B 정책" },
        { id: "e", title: "B 정책" },
      ],
      3,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
  });
});
