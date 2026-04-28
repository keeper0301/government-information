// lib/personalization/dedupe.ts
// 같은 행사·정책에 대한 다른 출처 뉴스를 중복 노출 차단.
//
// 사고 (2026-04-28): /news 개인화 섹션에 "전남교육청 직업계고 채용설명회"
// 가 4개 출처 (newsmaker / sports.donga / getnews / kpenews) 4 row 로 모두
// 노출. 사용자에게 같은 내용 반복.
//
// 알고리즘: 한국어 bigram (글자 쌍) set 의 Jaccard similarity.
//   - 제목 정규화 (한글·숫자·영문만 남김)
//   - bigram set 추출
//   - 누적 seen set 들과 비교, 임계값 이상이면 중복 처리
//   - 점수 높은 (이미 정렬된) 첫 항목만 유지
//
// 임계값 0.5 = bigram 의 50% 이상 겹치면 동일 행사 판정.
// 너무 낮으면 (0.3) 다른 행사도 dedupe, 너무 높으면 (0.7) 표기 약간 다른
// 같은 행사 못 잡음. 0.5 가 한국어 뉴스 제목에서 안전한 선.

function bigrams(s: string): Set<string> {
  const cleaned = s.replace(/[^가-힣0-9a-zA-Z]/g, "");
  const result = new Set<string>();
  for (let i = 0; i < cleaned.length - 1; i++) {
    result.add(cleaned.slice(i, i + 2));
  }
  return result;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter++;
  }
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * 비슷한 제목의 항목 dedupe. 입력 순서 유지 (점수 내림차순 등).
 *
 * @param items 정렬된 항목 (가장 점수 높은 것이 앞)
 * @param getTitle 항목에서 제목 추출 함수
 * @param threshold Jaccard similarity 임계값 (default 0.5)
 */
export function dedupeBySimilarity<T>(
  items: T[],
  getTitle: (item: T) => string,
  threshold = 0.5,
): T[] {
  const result: T[] = [];
  const seenBigrams: Set<string>[] = [];

  for (const item of items) {
    const title = getTitle(item);
    if (!title) {
      result.push(item);
      continue;
    }
    const bg = bigrams(title);
    let isDup = false;
    for (const s of seenBigrams) {
      if (jaccard(bg, s) >= threshold) {
        isDup = true;
        break;
      }
    }
    if (!isDup) {
      result.push(item);
      seenBigrams.push(bg);
    }
  }

  return result;
}
