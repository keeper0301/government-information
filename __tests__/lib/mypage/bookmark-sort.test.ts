// ============================================================
// __tests__/lib/mypage/bookmark-sort.test.ts
// 즐겨찾기 정렬 pure function 단위 테스트 (5 case)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  sortBookmarks,
  type SortableBookmark,
} from "@/lib/mypage/bookmark-sort";

// 테스트용 샘플 — 의도적으로 순서가 섞여 있어야 정렬 동작을 확인 가능
const SAMPLE: SortableBookmark[] = [
  {
    id: "b",
    type: "welfare",
    title: "나라사랑카드",
    apply_end: "2026-06-30",
    created_at: "2026-04-20T10:00:00Z",
  },
  {
    id: "a",
    type: "loan",
    title: "가족돌봄대출",
    apply_end: null, // 상시
    created_at: "2026-04-25T10:00:00Z",
  },
  {
    id: "c",
    type: "welfare",
    title: "다문화가정지원",
    apply_end: "2026-05-15",
    created_at: "2026-04-10T10:00:00Z",
  },
];

describe("sortBookmarks", () => {
  it("recent 모드: created_at 내림차순으로 정렬한다", () => {
    const result = sortBookmarks(SAMPLE, "recent");
    // 가장 최근 → 가장 오래된 순
    expect(result.map((it) => it.id)).toEqual(["a", "b", "c"]);
    // 원본은 변경되지 않아야 함 (immutability)
    expect(SAMPLE.map((it) => it.id)).toEqual(["b", "a", "c"]);
  });

  it("deadline 모드: apply_end 오름차순 + null 은 맨 뒤로 보낸다", () => {
    const result = sortBookmarks(SAMPLE, "deadline");
    // 가장 가까운 마감 → 먼 마감 → 상시 (null)
    expect(result.map((it) => it.id)).toEqual(["c", "b", "a"]);
  });

  it("title 모드: 한국어 가나다순으로 정렬한다", () => {
    const result = sortBookmarks(SAMPLE, "title");
    // 가족돌봄대출 → 나라사랑카드 → 다문화가정지원
    expect(result.map((it) => it.title)).toEqual([
      "가족돌봄대출",
      "나라사랑카드",
      "다문화가정지원",
    ]);
  });

  it("빈 배열을 안전하게 처리한다", () => {
    expect(sortBookmarks([], "recent")).toEqual([]);
    expect(sortBookmarks([], "deadline")).toEqual([]);
    expect(sortBookmarks([], "title")).toEqual([]);
  });

  it("같은 created_at 인 두 항목은 안정 정렬 (원래 순서 유지) 한다", () => {
    // created_at 이 완전히 동일한 두 항목을 만든다.
    // 모던 JS Array.prototype.sort 는 stable 이라 입력 순서가 보존된다.
    const sameTime: SortableBookmark[] = [
      {
        id: "first",
        type: "welfare",
        title: "Z제목",
        apply_end: null,
        created_at: "2026-04-25T10:00:00Z",
      },
      {
        id: "second",
        type: "loan",
        title: "A제목",
        apply_end: null,
        created_at: "2026-04-25T10:00:00Z",
      },
    ];
    const result = sortBookmarks(sameTime, "recent");
    // created_at 같으니 입력 순서 (first → second) 그대로 유지
    expect(result.map((it) => it.id)).toEqual(["first", "second"]);
  });
});
