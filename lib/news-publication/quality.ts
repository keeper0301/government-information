import type { NewsDraft } from './validation';

export const EDITORIAL_QUALITY_KEYS = ['scope', 'timeliness', 'usefulness', 'clarity', 'nonRepetition', 'coverage'] as const;

// 명시적인 실패 종결만 잡습니다. 단순한 '부족' 단어로 정책 사실이나 부정 설명을 막지 않습니다.
const rejectionReasons = [
  /(?:^|[.!?。\n])\s*(?:품질|검사|검토|평가)\s*(?:기준|요건)(?:을|를)?\s*(?:충족|만족)하지\s*못(?:합니다|한다|했습니다|했다)(?=[\s.!?。]|$)/u,
  /(?:^|[.!?。\n])\s*(?:이번\s*)?(?:품질\s*)?(?:판정|검사|검토)\s*(?:결과)?\s*[:：]?\s*(?:불합격|실패|보류)(?:입니다|이다)(?=[\s.!?。]|$)/u,
  /(?:^|[.!?。\n])\s*(?:(?:이|해당|이번)\s*)?(?:품질\s*)?(?:항목|검사|초안|본문|기사)(?:은|는|이|가)[^.!?。\n]{0,35}(?:통과할\s*수\s*없(?:습니다|다)|보류해야\s*(?:합니다|한다))(?=[\s.!?。]|$)/u,
];

// 합격 표시만 받아들이지 않고 항목별 이유와 실제 초안의 문장을 요구합니다.
export function validateEditorialQuality(value: unknown, draft: NewsDraft): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const checks = value as Record<string, { passed?: unknown; reason?: unknown; excerpt?: unknown }>;
  // 제목·질문·대상 이름만으로 시점·활용 정보·사례 보존을 입증할 수 없습니다.
  const explanation = [draft.answer, ...draft.sections.flatMap(section => section.paragraphs)];
  return EDITORIAL_QUALITY_KEYS.every(key => {
    const check = checks[key];
    const fields = (key === 'scope' ? [...explanation, draft.audience] : explanation)
      .map(text => text.replace(/\s+/g, ' '));
    return check?.passed === true && typeof check.reason === 'string'
      && check.reason.trim().length >= 15 && check.reason.length <= 400
      && !rejectionReasons.some(pattern => pattern.test(check.reason as string))
      && typeof check.excerpt === 'string' && check.excerpt.trim().length >= 8 && check.excerpt.length <= 160
      && fields.some(text => text.includes((check.excerpt as string).replace(/\s+/g, ' ').trim()));
  });
}
