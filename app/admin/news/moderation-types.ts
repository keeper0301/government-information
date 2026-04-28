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

// ─── 전체 목록 필터 ───
// /admin/news 의 "전체 뉴스 목록" 섹션 에서 카테고리·숨김 상태로 좁혀 본다.
// URL 쿼리 (?cat=&hidden=) 와 server action 양쪽에서 공유.

// news_posts.category 분포 — 'news' (정책뉴스) / 'press' (보도자료) /
// 'policy-doc' (정책자료) 가 운영상 3대 카테고리.
export const NEWS_CATEGORY_FILTERS = ["all", "news", "press", "policy-doc"] as const;
export type NewsCategoryFilter = (typeof NEWS_CATEGORY_FILTERS)[number];

// 카테고리 필터 라벨 — 비개발자 대상이라 한국어. select 옵션·풋노트 공유.
export const NEWS_CATEGORY_LABELS: Record<NewsCategoryFilter, string> = {
  all: "전체 카테고리",
  news: "정책뉴스",
  press: "보도자료",
  "policy-doc": "정책자료",
};

// 노출 필터 — '공개' 가 사이트에 보이는 정상 상태, '숨김' 은 모더레이션으로 가린 상태.
export const NEWS_HIDDEN_FILTERS = ["all", "visible", "hidden"] as const;
export type NewsHiddenFilter = (typeof NEWS_HIDDEN_FILTERS)[number];

export const NEWS_HIDDEN_LABELS: Record<NewsHiddenFilter, string> = {
  all: "전체 노출 상태",
  visible: "공개만",
  hidden: "숨김만",
};
