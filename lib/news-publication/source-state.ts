import type { NewsDraft } from './validation';

// 검토를 확대 전망으로, 체결 예고를 완료 사실로 바꾸는 실제 실패 유형을 차단합니다.
const sentences = (text: string) => text.split(/[.!?。\n]/u).map(part => part.trim()).filter(Boolean);
const completedAgreement = /(?:업무)?협약[^.!?。]{0,60}?체결(?:했다|하였습니다|했습니다|하였다|됐다|됐습니다|되었습니다|되었다|을\s*완료(?:했다|했습니다|하였다|하였습니다))/gu;
const plannedAgreement = /(?:업무)?협약[^.!?。]{0,60}체결(?:한다|합니다|할\s*(?:예정|계획|방침))/u;
const expansionPrediction = /확대(?:된다|됩니다|될\s*(?:전망|예정)|한다|합니다)|(?:확대|더\s*많은)[^.!?。]{0,100}?(?:전망|예상|기대|확정)/gu;

// 해당 주장에 바로 붙은 부정만 제외합니다. 다음 문장의 부정은 앞선 주장을 덮지 않습니다.
function asserts(sentence: string, pattern: RegExp): boolean {
  return [...sentence.matchAll(pattern)].some(match => {
    const tail = sentence.slice(match.index + match[0].length).trim();
    return !/^(?:이?라는|다는|라는|는)\s*(?:뜻|의미)(?:은|는|가|이)?\s*아(?:니|닙)/u.test(tail)
      && !/^(?:하|되)지\s*않|^(?:하|되)지\s*못|^(?:할|될)\s*수\s*없/u.test(tail)
      && !/^(?:이\s*)?아(?:니|닙)/u.test(tail)
      && !/^(?:으로|이라고)\s*단정(?:할\s*수\s*없|하지\s*않)/u.test(tail);
  });
}

export function sourceStateIssue(draft: NewsDraft, body: string): string | null {
  const sourceSentences = sentences(body);
  const expansionUnderReview = sourceSentences.some(text => /확대\s*(?:적용\s*)?여부[^.!?。]*검토/u.test(text));
  const agreementPlanned = sourceSentences.some(text => plannedAgreement.test(text));
  const fields = [draft.title, draft.question, draft.answer, draft.audience,
    ...draft.sections.flatMap(section => [section.heading, ...section.paragraphs])];
  for (const sentence of fields.flatMap(sentences)) {
    // 명시된 원문 문장을 그대로 보존한 경우와, 근거가 없는 새로운 전망을 구분합니다.
    // 부분 일치는 부정문의 앞부분만 잘라낸 단정을 허용하므로 문장 전체 일치만 인정합니다.
    const directlySupported = sourceSentences.some(original => original.replace(/\s+/gu, '') === sentence.replace(/\s+/gu, ''));
    if (directlySupported) continue;
    if (agreementPlanned && asserts(sentence, completedAgreement))
      return '원문의 협약 체결 예고를 완료 사실로 바꿨습니다. 날짜가 지나도 완료를 추정하지 말고 발표 당시 예정 상태를 보존하세요.';
    if (expansionUnderReview && asserts(sentence, expansionPrediction))
      return '원문의 확대 여부 검토를 확대 전망·확정으로 바꿨습니다. 확대 여부가 정해지지 않았다는 원문 범위를 보존하세요.';
  }
  return null;
}
