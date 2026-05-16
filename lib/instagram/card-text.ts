// ============================================================
// 인스타 카드 텍스트 처리 — 사장님 가르침 v1~v10 누적 학습 적용 (2026-05-16)
// ============================================================
// pure functions — DB·Satori·React 의존 X. 단위 테스트 가능.
// 호출처: app/api/instagram-card/[slug]/[index]/route.tsx
// ============================================================

/**
 * 의미 단위 보존 — "20만 원" / "20 만 원" → "20만원" 통일 (사장님 가르침 v7).
 * tokenizeSemantic 의 강조 부사 룰 매칭 가능하도록 사전 처리.
 */
export function preserveSemanticChunks(text: string): string {
  return text
    .replace(/(\d+(?:\.\d+)?)\s*만\s*원/gu, "$1만원")
    .replace(/(\d+(?:\.\d+)?)\s*억\s*원/gu, "$1억원");
}

/**
 * 문장 → 의미 단위 atomic chunk 배열 (사장님 가르침 v7 + v9 orphan).
 *
 * 룰:
 *  1) 어절 (공백) 단위 split
 *  2) 강조 부사 ("최대") 다음 숫자 어절 ("300만원") 만나면 합침
 *  3) orphan word 결합 — 마지막 token 이 3 글자 이하면 이전과 합침 (v9)
 *
 * 사용: flex item 으로 렌더링 시 각 chunk 가 atomic block 이라 wrap X.
 * "3월 30일" 의 "월" 이 부사 룰 매칭 안 되도록 prev 가 어절 일부일 때만 결합
 * (현재 구조에서는 자연 충족).
 */
export function tokenizeSemantic(text: string): string[] {
  const ADVERBS =
    /^(최대|최소|총|약|평균|매월|매일|매년|매주|연간|월간|주간|분기별|월|일|주|연)$/u;
  const NUMERIC_START = /^\d/u;
  const tokens = text.split(/\s+/u).filter(Boolean);
  const merged: string[] = [];
  for (const t of tokens) {
    const prev = merged[merged.length - 1];
    if (prev && ADVERBS.test(prev) && NUMERIC_START.test(t)) {
      merged[merged.length - 1] = `${prev} ${t}`;
    } else {
      merged.push(t);
    }
  }
  // v9 orphan 결합 — 마지막 token 이 3 글자 이하 (예: "복지", "방법", "조성") 면
  // 이전과 합침. 긴 title 의 마지막 단어가 한 줄 차지 (광주 광산구 사고) 방지.
  if (merged.length >= 2) {
    const last = merged[merged.length - 1];
    if (last.length <= 3 && !NUMERIC_START.test(last)) {
      merged[merged.length - 2] = `${merged[merged.length - 2]} ${last}`;
      merged.pop();
    }
  }
  return merged;
}

/**
 * meta_description → 문장별 split (사장님 가르침 v1).
 *
 * 한국어 종결형 (~다·~요·~까?) + 영어 .!? 모두 cover. max 문장 cap 으로
 * 매우 긴 description 도 카드 안에 안전.
 *
 * split 정규식은 [ \t]+ 명시 — NBSP ( ) / Word Joiner (⁠) 안 잘림.
 */
export function splitSentences(text: string, max: number): string[] {
  const parts = text
    .split(/(?<=[다요까])\.[ \t]+|(?<=[.!?])[ \t]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return [text.trim()];
  return parts.slice(0, max);
}
