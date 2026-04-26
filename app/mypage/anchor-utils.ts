// 마이페이지 탭 식별자 — page.tsx 의 Tabs value 와 1:1 매칭
export type MypageTab = "profile" | "consents" | "account";

export const VALID_TABS: readonly MypageTab[] = [
  "profile",
  "consents",
  "account",
] as const;

// hash → tab 매핑 테이블
// 외부 링크 호환을 위해 #consents 같은 legacy 앵커도 받아준다.
const HASH_TO_TAB: Record<string, MypageTab> = {
  profile: "profile",
  consents: "consents",
  account: "account",
};

// URL hash 문자열을 받아 매칭되는 탭 ID 를 돌려준다.
// '' 이나 '#' 단독은 기본 탭(profile) 로 처리.
// 매칭 실패 시 null (호출 측에서 변환 안 하고 둘지 결정).
export function hashToTab(hash: string): MypageTab | null {
  if (!hash || hash === "#") return "profile";
  const key = hash.replace(/^#/, "").toLowerCase();
  return HASH_TO_TAB[key] ?? null;
}

// 외부에서 받은 임의 문자열이 우리 탭 enum 에 속하는지 검사.
export function isValidTab(value: unknown): value is MypageTab {
  return (
    typeof value === "string" &&
    (VALID_TABS as readonly string[]).includes(value)
  );
}

// 무효한 값은 기본 탭으로 정규화. URL 쿼리에서 받은 값 처리에 사용.
export function normalizeTab(value: unknown): MypageTab {
  return isValidTab(value) ? value : "profile";
}
