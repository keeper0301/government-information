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
  | "checklist_default";

export type ResolvedCardHook = {
  type: CardHookType;
  label: string;
};

const MONEY_RE = /금액|만원|원\b|최대|한도|지원금|축하금|수당/;
const OFFICIAL_ROUTE_RE = /대출|융자|정책자금|컨설팅|공고|모집/;

export function resolveInstagramCardHook(input: {
  title: string;
  description?: string | null;
  category?: string | null;
}): ResolvedCardHook {
  const text = `${input.category ?? ""} ${input.title} ${input.description ?? ""}`;

  if (MONEY_RE.test(text)) {
    return { type: "money_deadline", label: "대상·금액·기간 한 장 정리" };
  }

  if (OFFICIAL_ROUTE_RE.test(text)) {
    return { type: "official_route", label: "공식 신청처만 먼저 확인" };
  }

  return { type: "checklist_default", label: "신청 전 이 3가지만 확인" };
}
