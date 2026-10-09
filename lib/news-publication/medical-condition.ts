import type { NewsDraft } from './validation';

// 원문에 명시된 의료비 지원의 질환 제한을 숫자만 남긴 설명으로 바꾸지 않습니다.
export function medicalConditionIssue(draft: NewsDraft, body: string): string | null {
  const normalize = (text: string) => text.replace(/[\s·ㆍ,]/gu, '');
  const sourceSentences = body.split(/[.!?。\n]/u).map(normalize);
  const restricted = sourceSentences.some(sentence =>
    /중증난치성질환에한해/u.test(sentence) && /본인부담금(?:의)?50%/u.test(sentence));
  if (!restricted) return null;
  const texts = [draft.title, draft.question, draft.answer, draft.audience,
    ...draft.sections.flatMap(section => [section.heading, ...section.paragraphs])];
  for (const text of texts) {
    for (const sentence of text.split(/[.!?。]/u).map(normalize)) {
      if (!/본인부담금(?:의)?50%/u.test(sentence) || !/지원/u.test(sentence)) continue;
      const bothConditions = /중증(?:질환)?(?:및|또는)?난치성질환/u.test(sentence);
      const widened = /(?:모든|전체|일반)질환|질환(?:종류)?(?:와|과)에?관계없이/u.test(sentence);
      for (const claim of sentence.matchAll(/본인부담금(?:의)?50%[^.!?。]{0,60}?지원/gu)) {
        // 50% 지원 단정 바로 뒤의 부정만 인정합니다. 다른 혜택의 부정으로 덮지 않습니다.
        const tail = sentence.slice(claim.index + claim[0].length);
        if (/^(?:한다|했다|받는다|받았다)는(?:뜻|의미)(?:은|는|이|가)?아(?:닙니다|니다)$/u.test(tail)) continue;
        if (!bothConditions || widened)
          return '본인부담금 50% 지원 설명에서 원문의 중증·난치성 질환 조건을 유지하세요.';
      }
    }
  }
  return null;
}
