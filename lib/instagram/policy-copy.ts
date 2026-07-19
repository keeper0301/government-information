// ============================================================
// Instagram policy-brand copy cleanup
// ============================================================
// Instagram 카드/캡션은 블로그 SEO 제목을 그대로 쓰면 "놓치면 후회" 같은
// 저가 클릭 유도 문구가 정책 브랜드 신뢰감을 깎는다. DB 원문은 건드리지 않고,
// Instagram 외부 발행 표면에서만 신청 순서·대상 확인 중심 문구로 정리한다.
// ============================================================

const TITLE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\s*성장\s*기회\s*놓치면\s*후회\s*/g, " 지원 내용 확인"],
  [/\s*놓치면\s*안\s*될\s*기회\s*/g, " 지원 내용 확인"],
  [/\s*놓치면\s*후회\s*/g, " 신청 전 확인"],
  [/\s*놓치지\s*마세요!?\s*/g, " 신청 전 확인"],
  [/\s*마감\s*임박!?\s*/g, " 신청 기간 확인"],
  [/\s*마감부터\s*봐야\s*해요\s*/g, " 신청 기간 확인"],
  [/\s*마감\s*지나면\s*끝\s*/g, " 신청 기간 확인"],
  [/\s*조건\s*놓치면\s*탈락\s*/g, " 대상 조건 확인"],
  [/\s*이거\s*그냥\s*넘기면\s*안\s*돼요\s*/g, " 신청 전 확인"],
  [/\s*기회\s*잡으세요!?\s*/g, " 신청 방법 확인"],
  [/\s*최대\s*지원\s*받으세요!?\s*/g, " 지원 내용 확인"],
  [/\s*주목!?\s*/g, " 확인"],
  [/\s*1분\s*확인\s*/g, " 자격 확인"],
  [/\s*히든스타\s*발굴\s*/g, " 참가 대상 확인"],
  [/\s*최대\s*얼마까지\??\s*/g, " 지원 한도 확인"],
  [/\s*얼마까지\??\s*/g, " 지원 한도 확인"],
];

const DESCRIPTION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/놓치면\s*후회(?:합니다|해요|할 수 있습니다)?/g, "신청 전 확인이 필요합니다"],
  [/놓치지\s*마세요!?/g, "신청 전 확인하세요"],
  [/놓치면\s*안\s*될\s*기회/gi, "신청 전 확인할 지원 내용"],
  [/마감\s*임박!?/g, "신청 기간 확인"],
  [/마감부터\s*봐야\s*해요/g, "신청 기간을 먼저 확인하세요"],
  [/마감\s*지나면\s*끝/g, "신청 기간을 확인하세요"],
  [/조건\s*놓치면\s*탈락/g, "대상 조건을 확인하세요"],
  [/이거\s*그냥\s*넘기면\s*안\s*돼요/g, "신청 전 확인이 필요합니다"],
  [/기회\s*잡으세요!?/g, "신청 방법을 확인하세요"],
  [/최대\s*지원\s*받으세요!?/g, "지원 내용을 확인하세요"],
  [/바로가기\s*[👇↓]+/gi, "공식 신청처 확인"],
  [/핵심만\s*보기\s*좋게\s*정리(?:했습니다|해봤어요)?/gi, "대상·기간·서류를 정리했습니다"],
  [/찾는\s*분들이\s*많아서\s*핵심만/gi, "신청 전 확인할 내용을"],
];

export function sanitizeInstagramPolicyTitle(title: string): string {
  let cleaned = String(title || "").trim();
  for (const [pattern, replacement] of TITLE_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  cleaned = normalizeCopy(cleaned);
  cleaned = cleaned.replace(/\s+([,.;:!?])/g, "$1").replace(/!+/g, "");
  return cleaned || String(title || "").trim();
}

export function sanitizeInstagramPolicyDescription(description: string | null): string | null {
  if (!description) return description;
  let cleaned = String(description).trim();
  for (const [pattern, replacement] of DESCRIPTION_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  cleaned = normalizeCopy(cleaned);
  return cleaned || description;
}

export function sanitizeInstagramPolicyCopy<T extends { title: string; meta_description: string | null }>(
  post: T,
): T {
  return {
    ...post,
    title: sanitizeInstagramPolicyTitle(post.title),
    meta_description: sanitizeInstagramPolicyDescription(post.meta_description),
  };
}

function normalizeCopy(value: string): string {
  return value
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([·—-])\s+/g, " $1 ")
    .trim();
}
