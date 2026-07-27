// ============================================================
// Instagram first-card hook resolver
// ============================================================
// The cover-card hook gives a concrete save/share reason without cheap fear
// copy. The returned type is stored in publish audit logs so the admin
// performance dashboard can compare hook types later.
// ============================================================

export type CardHookType =
  | "money_deadline"
  | "official_route"
  | "share_age"
  | "housing_condition"
  | "checklist_default";

export type ResolvedCardHook = {
  type: CardHookType;
  label: string;
};

const MONEY_RE = /금액|만원|원\b|최대|한도|지원금|축하금|수당/;
const YOUTH_RE = /청년|청소년|학생|대학생/;
const HOUSING_RE = /주거|월세|전세|임대|보증금|무주택/;
const OFFICIAL_ROUTE_RE = /대출|융자|정책자금|컨설팅|공고|모집/;

export function resolveInstagramCardHook(input: {
  title: string;
  description?: string | null;
  category?: string | null;
}): ResolvedCardHook {
  const text = `${input.category ?? ""} ${input.title} ${input.description ?? ""}`;

  if (MONEY_RE.test(text)) {
    return { type: "money_deadline", label: "저장 포인트 · 대상 · 금액 · 신청기간" };
  }

  if (HOUSING_RE.test(text)) {
    return { type: "housing_condition", label: "저장 포인트 · 대상 조건 · 주거비 · 기간" };
  }

  if (YOUTH_RE.test(text)) {
    return { type: "share_age", label: "공유 포인트 · 대상 나이 · 기간 · 신청처" };
  }

  if (OFFICIAL_ROUTE_RE.test(text)) {
    return { type: "official_route", label: "저장 포인트 · 대상 · 서류 · 공식 신청처" };
  }

  return { type: "checklist_default", label: "저장 포인트 · 대상 · 기간 · 공식 신청처" };
}
