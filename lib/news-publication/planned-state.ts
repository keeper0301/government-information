import type { NewsDraft } from './validation';

// 원문 부제에 기사 전체의 시행 예정이 명시된 경우만 추가 검사합니다.
// 일부 사업의 일정이나 본문 속 다른 날짜로 기사 전체의 상태를 추측하지 않습니다.
export function plannedStateIssue(draft: NewsDraft, body: string): string | null {
  const plannedHeader = body.split(/\r?\n/u).slice(0, 3).some(line =>
    /^(?:내년|20\d{2}년)\s*(?:1[0-2]|[1-9])월부터\s*(?:본격\s*)?(?:시행|도입)\s*예정\s*$/u.test(line.trim()));
  if (!plannedHeader) return null;
  const firstAnswer = draft.answer.split(/[.!?。]/u)[0];
  const plannedAction = /(?:도입|시행|확대|지원|연장|적용|강화)[^.!?。]{0,30}?예정(?!자)/u;
  if (!plannedAction.test(draft.title) || !plannedAction.test(firstAnswer))
    return '제목과 첫 답변에 시행 예정 상태를 명시하세요. 다른 문장의 예정 안내로 확정 표현을 덮지 마세요.';
  const texts = [draft.title, draft.question, draft.answer, draft.audience,
    ...draft.sections.flatMap(section => [section.heading, ...section.paragraphs])];
  const currentBenefit = /(?:이제는|이제부터|현재|지금|이미)[^.!?。]{0,140}?(?:지원(?:을)?\s*받을\s*수\s*(?:있|도록)|보장받을\s*수\s*있|지원(?:합니다|한다)|시행\s*중)/gu;
  const completedBenefit = /(?:확대|연장|도입|시행)(?:됐|되었|되어\s*있|했|하였|[이가]\s*이루어졌)/gu;
  // 앞 문단의 예정 안내로 본문의 '도입합니다·제공합니다' 같은 시행 단정을 덮지 않습니다.
  const unmarkedBenefit = /(?:도입|지원|연장|확대|시행)합니다|(?:강화|확대|연장)됩니다|(?:의료비\s*지원|보험\s*(?:지원|보장)|지원금?|보상|진료비|혜택)\s*(?:을|를)?\s*제공합니다/gu;
  for (const text of texts) {
    for (const sentence of text.split(/[.!?。]/u)) {
      for (const pattern of [currentBenefit, completedBenefit, unmarkedBenefit]) {
        for (const claim of sentence.matchAll(pattern)) {
          // '기존'이라는 단어만으로 허용하지 않고, 현재 표시를 뺀 기존 설명이 원문에 그대로 있을 때만 인정합니다.
          const existingClaim = sentence.trim().replace(/^현재\s*/u, '').replace(/\s+/gu, '');
          if (pattern === currentBenefit && /^기존/u.test(existingClaim)
            && !/(?:새로운|새\s*(?:보험|제도)|이번)/u.test(sentence)
            && body.replace(/\s+/gu, '').includes(existingClaim)) continue;
          const tail = sentence.slice(claim.index + claim[0].length);
          // 해당 단정 바로 뒤의 부정 설명만 인정합니다. 다른 조건의 부정은 오류를 덮지 않습니다.
          if (/^다는\s*(?:뜻|의미)(?:은|는|이|가)?\s*아(?:니|닙)/u.test(tail)) continue;
          if (/^(?:이|은|는)\s*아(?:니|닙)/u.test(tail)) continue;
          if (/^(?:나요|습니까|을까요|는가)\s*$/u.test(tail)
            || /^지\s*않(?:습니다|는다|아요|다)\s*$/u.test(tail)) continue;
          return '시행 예정인 혜택을 현재 시행·완료 상태로 쓰지 마세요. 각 문장의 예정 상태를 유지하세요.';
        }
      }
    }
  }
  return null;
}
