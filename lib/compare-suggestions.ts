// ============================================================
// lib/compare-suggestions.ts — /compare 자동 페어 추천 헬퍼
// ============================================================
// /compare 빈 페이지 진입 시, 사용자 즐겨찾기 목록에서
// 같은 type (welfare/loan) + 같은 category 묶음을 자동으로 페어링.
// ≥ 2건 인 그룹만 페어 후보로 사용.
//
// 큰 그룹 우선 (페어당 정책 수가 많은 순)으로 정렬해 최대 3개 페어 반환.
// ============================================================

// 입력 — 즐겨찾기 한 줄에서 필요한 최소 정보만 추림
export interface SuggestionInput {
  id: string;
  type: "welfare" | "loan";
  title: string;
  category: string | null;
}

// 출력 — /compare?type=...&ids=... 으로 그대로 옮길 수 있는 형태
export interface SuggestPair {
  type: "welfare" | "loan";
  ids: string[]; // 2~3건
  category: string;
  reason: string; // "내 즐겨찾기 청년 카테고리 N건"
}

const MAX_PER_PAIR = 3; // /compare 한도 (최대 3개)
const MAX_PAIRS = 3; // 추천 카드 노출 한도

// 같은 type + 같은 category 그룹핑 → ≥ 2건 인 그룹만 페어 후보로 변환.
// category 가 null/빈 문자열인 row 는 그룹핑 키로 못 써서 제외.
export function buildSuggestions(items: SuggestionInput[]): SuggestPair[] {
  const groups = new Map<string, SuggestionInput[]>();
  for (const it of items) {
    if (!it.category) continue; // null/빈 문자열 제외
    const key = `${it.type}::${it.category}`;
    const arr = groups.get(key) ?? [];
    arr.push(it);
    groups.set(key, arr);
  }

  const pairs: SuggestPair[] = [];
  for (const [key, arr] of groups) {
    if (arr.length < 2) continue; // 1건짜리 그룹은 비교 불가
    const [type, category] = key.split("::") as ["welfare" | "loan", string];
    const ids = arr.slice(0, MAX_PER_PAIR).map((x) => x.id);
    pairs.push({
      type,
      ids,
      category,
      reason: `내 즐겨찾기 ${category} ${ids.length}건`,
    });
  }

  // 페어당 정책 수가 많은 순 (큰 그룹 우선) → 최대 MAX_PAIRS 개
  pairs.sort((a, b) => b.ids.length - a.ids.length);
  return pairs.slice(0, MAX_PAIRS);
}
