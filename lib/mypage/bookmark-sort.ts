// ============================================================
// lib/mypage/bookmark-sort.ts — 즐겨찾기 정렬 pure function
// ============================================================
// `/mypage/bookmarks` 페이지가 server component 라 SSR 단계에서
// fetch 후 서버에서 정렬을 적용한다. URL `?sort=` 가 변경되면
// 페이지가 다시 SSR 되며 이 함수가 호출된다.
//
// pure function 으로 분리한 이유:
//   1. 단위 테스트가 쉬움 (DB·React 의존 0)
//   2. 정렬 로직 변경 시 page.tsx 를 건드리지 않음
//   3. 향후 admin 화면에서도 재사용 가능
// ============================================================

// 사용자가 URL 로 선택할 수 있는 정렬 모드 — 3가지만 지원
export type SortMode = "recent" | "deadline" | "title";

// 정렬에 필요한 최소 필드만 강제 — 호출 측에서 더 많은 필드를 가진
// 객체를 넘겨도 generic 으로 그대로 받아 반환한다.
export interface SortableBookmark {
  // 정책 식별자 (debug·key 용, 정렬 자체에는 사용 안 함)
  id: string;
  // welfare / loan 구분 — type 필터에서 사용 (sortBookmarks 에서는 무시)
  type: "welfare" | "loan";
  // 정책 제목 — title 정렬 (가나다 순) 의 키
  title: string;
  // 신청 마감일 (YYYY-MM-DD). null = 상시 모집 → deadline 정렬 시 맨 뒤로
  apply_end: string | null;
  // 즐겨찾기 추가 시각 (ISO 8601). recent 정렬 시 desc 키
  created_at: string;
}

// 인자로 받은 배열을 변형하지 않고, 새 배열을 반환 (immutability 유지).
// generic 으로 호출 측 type 정보를 보존해 page.tsx 가 추가 필드 (region 등)
// 를 그대로 사용할 수 있다.
export function sortBookmarks<T extends SortableBookmark>(
  items: T[],
  mode: SortMode,
): T[] {
  // 원본 변경 방지 — spread 로 얕은 복사 후 sort
  const arr = [...items];

  switch (mode) {
    case "recent":
      // 최신순 — created_at 내림차순. ISO 8601 은 문자열 비교만으로
      // 시간순 정렬이 보장되므로 Date 변환 불필요.
      arr.sort((a, b) => b.created_at.localeCompare(a.created_at));
      break;

    case "deadline":
      // 마감 임박순 — apply_end 오름차순. null (상시) 은 맨 뒤로 밀기.
      arr.sort((a, b) => {
        if (a.apply_end === null && b.apply_end === null) return 0;
        if (a.apply_end === null) return 1; // a 가 null → b 가 앞
        if (b.apply_end === null) return -1; // b 가 null → a 가 앞
        return a.apply_end.localeCompare(b.apply_end);
      });
      break;

    case "title":
      // 가나다순 — 한국어 locale 비교. localeCompare("ko") 로 한글 정렬 정확.
      arr.sort((a, b) => a.title.localeCompare(b.title, "ko"));
      break;
  }

  return arr;
}
