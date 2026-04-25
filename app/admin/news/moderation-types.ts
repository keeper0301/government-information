// ============================================================
// /admin/news 모더레이션 — 상수·타입 모듈
// ============================================================
// "use server" 모듈은 async function 만 export 가능. 상수·타입은 따로 모아
// 클라이언트 컴포넌트(HideNewsButton)·서버 컴포넌트(/admin/news/page.tsx)
// 어디서든 import 할 수 있도록 분리한다.
// ============================================================

// 사유 카테고리 — 모달 dropdown 과 server action 검증 양쪽에서 공유.
export const HIDE_REASON_CATEGORIES = ["저작권", "오보·오해소지", "기타"] as const;
export type HideReasonCategory = (typeof HIDE_REASON_CATEGORIES)[number];

// 검색 결과·최근 숨김 행 — UI 와 server action 결과 타입 공통.
export type NewsSearchRow = {
  id: string;
  slug: string;
  title: string;
  ministry: string | null;
  category: string;
  published_at: string;
  is_hidden: boolean;
  hidden_at: string | null;
  hidden_reason: string | null;
};
