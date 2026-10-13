import type { NewsDraft } from './validation';

// 원문에 명시된 의료비 지원의 질환 제한을 숫자만 남긴 설명으로 바꾸지 않습니다.
export function medicalConditionIssue(draft: NewsDraft, body: string): string | null {
  const normalize = (text: string) => text.replace(/[\s·ㆍ,]/gu, '');
  const sourceSentences = body.split(/[.!?。\n]/u).map(normalize);
  const restricted = sourceSentences.some(sentence =>
    /중증난치성질환에한해/u.test(sentence) && /본인부담금(?:의)?50%/u.test(sentence));
  if (!restricted) return null;
  const fullSupport = sourceSentences.some(sentence =>
    /인과성이인정(?:돼야|되면|된경우).{0,40}진료비(?:를)?전액지원(?:받았다|한다|했다|된다|됐다)$/u.test(sentence));
  const texts = [draft.title, draft.question, draft.answer, draft.audience,
    ...draft.sections.flatMap(section => [section.heading, ...section.paragraphs])];
  for (const text of texts) {
    for (const sentence of text.split(/[.!?。]/u).map(normalize)) {
      if (fullSupport) {
        for (const claim of sentence.matchAll(/인과성(?:이|은)?인정(?:된|되면|돼).{0,80}?(?:본인부담금|의료비|진료비)(?:의)?(?:일부|50%)만?(?:을|를)?지원/gu)) {
          // 미인정 조건으로 넘어간 설명과 해당 단정 자체를 부정하는 문장은 구분합니다.
          if (/전액(?:을)?지원.{0,30}(?:인정되지|미인정)/u.test(claim[0])) continue;
          const tail = sentence.slice(claim.index + claim[0].length);
          if (/^(?:됐|되었|했|한|받았)다는(?:뜻|의미)(?:은|는|이|가)?아(?:닙니다|니다)$/u.test(tail)) continue;
          return '군 복무와 인과성이 인정된 경우의 원문 전액 지원 조건을 일부 지원으로 바꾸지 마세요.';
        }
      }
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
