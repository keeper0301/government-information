import type { NewsDraft } from './validation';

export const EDITORIAL_QUALITY_KEYS = ['scope', 'timeliness', 'usefulness', 'clarity', 'nonRepetition', 'coverage'] as const;

// 합격 표시만 받아들이지 않고 항목별 이유와 실제 초안의 문장을 요구합니다.
export function validateEditorialQuality(value: unknown, draft: NewsDraft): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const checks = value as Record<string, { passed?: unknown; reason?: unknown; excerpt?: unknown }>;
  const fields = [draft.title, draft.question, draft.answer, draft.audience,
    ...draft.sections.flatMap(section => [section.heading, ...section.paragraphs])].map(text => text.replace(/\s+/g, ' '));
  return EDITORIAL_QUALITY_KEYS.every(key => {
    const check = checks[key];
    return check?.passed === true && typeof check.reason === 'string'
      && check.reason.trim().length >= 15 && check.reason.length <= 400
      && typeof check.excerpt === 'string' && check.excerpt.trim().length >= 8 && check.excerpt.length <= 160
      && fields.some(text => text.includes((check.excerpt as string).replace(/\s+/g, ' ').trim()));
  });
}
