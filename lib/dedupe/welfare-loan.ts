// ============================================================
// welfare/loan 중복 정책 자동 탐지 (Phase 3 Task 3 — B3)
// ============================================================
// 같은 정책이 다른 출처에서 수집될 때 (예: 같은 청년수당이 bokjiro + youth-v2
// 양쪽에 등장) 사용자에게 중복 노출되는 사고를 차단하기 위한 매칭 알고리즘.
//
// 동작 정책:
//   - 신규 row 와 기존 활성 row 페어링 → 4 signal 가중 합 score ≥ 0.7 이면 후보.
//   - cron(/api/dedupe-detect) 가 후보를 duplicate_of_id 에 임시 저장.
//   - 사장님이 /admin/dedupe 에서 수동 confirm 시 영구 (변경 없음 — 이미 저장됨).
//   - 잘못 잡힌 경우 reject → duplicate_of_id 를 NULL 로 reset.
//
// 같은 source_code 끼리는 collector 의 upsert 로 처리되므로 dedupe 대상 제외
// (cross-source 중복만 잡음).
// ============================================================

// ─── 매칭 입력 row (테이블 무관) ─────────────────────────────
export interface DedupeRow {
  id: string;
  source_code: string | null;
  title: string | null;
  region: string | null;
  apply_end: string | null; // YYYY-MM-DD
  benefit_tags: string[] | null;
}

export type DedupeTableName = "welfare_programs" | "loan_programs";

export type DedupeDbRow = {
  id: string;
  source_code: string | null;
  title: string | null;
  region?: string | null;
  region_tags?: string[] | null;
  apply_end: string | null;
  benefit_tags: string[] | null;
};

export type DedupeCandidateDbRow = DedupeDbRow & {
  duplicate_of_id: string | null;
};

export function getDedupeSelectColumns(
  table: DedupeTableName,
  options: { includeDuplicateOfId?: boolean } = {},
): string {
  const regionColumn = table === "loan_programs" ? "region_tags" : "region";
  const columns = ["id", "source_code", "title", regionColumn, "apply_end", "benefit_tags"];
  if (options.includeDuplicateOfId) columns.push("duplicate_of_id");
  return columns.join(", ");
}

function extractLoanRegion(title: string | null, regionTags?: string[] | null): string | null {
  if (regionTags && regionTags.length > 0) return regionTags.join(" ");
  const m = title?.match(/[\[\(]([^\]\)]+)/);
  return m ? m[1].trim() : null;
}

export function normalizeDedupeDbRow(
  table: DedupeTableName,
  row: DedupeDbRow,
): DedupeRow {
  return {
    id: row.id,
    source_code: row.source_code,
    title: row.title,
    region:
      table === "loan_programs"
        ? extractLoanRegion(row.title, row.region_tags)
        : row.region ?? null,
    apply_end: row.apply_end,
    benefit_tags: row.benefit_tags ?? [],
  };
}

// ─── 매칭 결과 ─────────────────────────────────────────────
export interface DedupeMatch {
  baseId: string;        // 신규 row id (duplicate_of_id 채울 row)
  candidateId: string;   // 기존 활성 row id (참조 대상)
  score: number;         // 0~1 가중 합
  signals: {
    title: number;
    region: number;
    applyEnd: number;
    benefitTags: number;
  };
}

// 임계값 — 가중 합 0.7 이상이면 중복 의심.
// 실험 근거: title 0.85 (substring) + region 1 + applyEnd 1 + benefitTags 0.5
//   → 0.4*0.85 + 0.2 + 0.2 + 0.1 = 0.84 (확실한 중복)
// 너무 낮추면 false positive 폭증, 너무 높이면 진짜 중복 놓침.
const SCORE_THRESHOLD = 0.7;

// ─── 1) 제목 정규화 ─────────────────────────────────────────
// 다양한 출처가 같은 정책을 다르게 적는 경향:
//   "[공고] 청년수당 (2026년)" vs "청년수당"
// → bracket prefix·괄호·공백·특수문자 제거 후 lowercase 비교.
export function normalizeTitle(s: string): string {
  return s
    .replace(/^\[[^\]]+\]\s*/, "")             // [공고] 같은 prefix
    .replace(/\([^)]*\)/g, "")                 // (괄호 안 내용)
    .replace(/\s+/g, "")                       // 공백 모두 제거
    .replace(/[「」『』《》【】·\-—_]/g, "")  // 특수 따옴표·하이픈류
    .toLowerCase();
}

// ─── 2) 제목 유사도 ────────────────────────────────────────
// 정확 일치 1.0 / 짧은 쪽이 긴 쪽에 그대로 포함되면 0.85 /
// 그 외엔 4글자 substring 공통 비율 (loose token similarity).
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1.0;
  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  if (longer.includes(shorter)) return 0.85;
  // 4글자 윈도우 substring 공통 카운트 / 짧은 길이 (정규화)
  let common = 0;
  for (let i = 0; i + 3 < shorter.length; i++) {
    const sub = shorter.slice(i, i + 4);
    if (longer.includes(sub)) common++;
  }
  return Math.min(common / Math.max(shorter.length - 3, 1), 1);
}

// ─── 3) 지역 매칭 ─────────────────────────────────────────
// 정확 일치 1.0 / 광역 prefix 만 같으면 0.5 (예: '전라남도' vs '전라남도 순천시')
// / 그 외 0. null/빈 값 은 0 (불명확은 매칭 신호로 치지 않음).
export function regionMatch(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aPrefix = a.split(" ")[0];
  const bPrefix = b.split(" ")[0];
  if (aPrefix && aPrefix === bPrefix) return 0.5;
  return 0;
}

// ─── 4) 신청 마감일 매칭 ───────────────────────────────────
// 같은 마감일 1.0 / ±7일 0.5 / 그 외 0. null 은 0.
// 같은 정책의 다른 출처는 마감일도 거의 동일하게 적힘.
export function applyEndMatch(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 0;
  const diffDays = Math.abs(da - db) / (1000 * 60 * 60 * 24);
  if (diffDays <= 7) return 0.5;
  return 0;
}

// ─── 5) benefit_tags Jaccard 유사도 ───────────────────────
// 교집합 / 합집합 (0~1). 같은 정책이면 같은 태그 묶음을 공유할 확률 높음.
export function benefitTagsMatch(
  a: string[] | null,
  b: string[] | null,
): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  const intersection = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...a, ...b]).size;
  if (union === 0) return 0;
  return intersection / union;
}

// ─── 6) 종합 score + 매칭 결정 ───────────────────────────
// 가중치: title 0.4 + region 0.2 + applyEnd 0.2 + benefitTags 0.2 (합 1.0).
// 같은 source_code 끼리는 collector upsert 가 처리하므로 매칭 후보에서 제외.
export function detectDuplicateScore(
  rowA: DedupeRow,
  rowB: DedupeRow,
): DedupeMatch | null {
  if (rowA.id === rowB.id) return null;
  if (
    rowA.source_code &&
    rowB.source_code &&
    rowA.source_code === rowB.source_code
  ) {
    return null;
  }

  const titleScore =
    rowA.title && rowB.title ? titleSimilarity(rowA.title, rowB.title) : 0;
  const regionScore = regionMatch(rowA.region, rowB.region);
  const applyEndScore = applyEndMatch(rowA.apply_end, rowB.apply_end);
  const benefitScore = benefitTagsMatch(rowA.benefit_tags, rowB.benefit_tags);

  const score =
    titleScore * 0.4 +
    regionScore * 0.2 +
    applyEndScore * 0.2 +
    benefitScore * 0.2;

  if (score < SCORE_THRESHOLD) return null;

  return {
    baseId: rowA.id,
    candidateId: rowB.id,
    score,
    signals: {
      title: titleScore,
      region: regionScore,
      applyEnd: applyEndScore,
      benefitTags: benefitScore,
    },
  };
}

// 외부에서 임계값 참조 가능하도록 export (tests / cron 로깅용)
export const DEDUPE_THRESHOLD = SCORE_THRESHOLD;
