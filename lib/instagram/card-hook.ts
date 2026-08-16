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
  | "document_save"
  | "small_business_share"
  | "share_age"
  | "housing_condition"
  | "checklist_default";

export type ResolvedCardHook = {
  type: CardHookType;
  label: string;
};

const MONEY_RE = /금액|만원|원\b|최대|한도|지원금|축하금|수당/;
const DOCUMENT_RE = /서류|준비물|제출|증빙|구비서류|신청서/;
const YOUTH_RE = /청년|청소년|학생|대학생/;
const HOUSING_RE = /주거|월세|전세|임대|보증금|무주택/;
const SMALL_BUSINESS_RE = /소상공인|자영업|자영업자|사업자|중소기업|창업|폐업|상권|신용보증|보증|정책자금|융자|대출/;
const OFFICIAL_ROUTE_RE = /컨설팅|공고|모집|신청|접수/;

export function resolveInstagramCardHook(input: {
  title: string;
  description?: string | null;
  category?: string | null;
}): ResolvedCardHook {
  const text = `${input.category ?? ""} ${input.title} ${input.description ?? ""}`;

  // hook_cta_weak 대응: 금액 신호가 있어도 먼저 "누구에게 공유할지"가 보이게
  // audience-specific hook을 우선한다. 금액-only 정책만 money hook으로 보낸다.
  if (HOUSING_RE.test(text)) {
    return { type: "housing_condition", label: "월세·전세 보는 사람에게 공유 · 조건 3개" };
  }

  if (SMALL_BUSINESS_RE.test(text)) {
    return { type: "small_business_share", label: "사장님이면 저장 · 신청 전 3개" };
  }

  if (YOUTH_RE.test(text)) {
    return { type: "share_age", label: "청년·학생에게 공유 · 나이·기간" };
  }

  if (DOCUMENT_RE.test(text)) {
    return { type: "document_save", label: "저장 · 제출서류 빠뜨리면 재신청" };
  }

  if (MONEY_RE.test(text)) {
    return { type: "money_deadline", label: "저장 · 금액보다 대상·마감 먼저" };
  }

  if (OFFICIAL_ROUTE_RE.test(text)) {
    return { type: "official_route", label: "저장 · 공식 신청처 헷갈림 방지" };
  }

  return { type: "checklist_default", label: "저장 · 대상/기간/신청처 30초 체크" };
}
