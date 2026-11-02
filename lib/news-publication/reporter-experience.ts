import type { NewsDraft } from './validation';

export const REPORTER_EXPERIENCE_GUIDANCE = '기자·필자의 개인 체험은 원문 기자의 경험으로 표시하세요. 나·나는·나 역시의 경험을 참관 시민들·방문객 전체의 반응으로 확대하지 마세요. 구매할 수 있다는 설명이나 구경한 경험을 실제 구매·결제한 사실로 바꾸지 마세요.';

// 원문 근거가 개인 경험인데 집단 반응이나 실제 구매 사실로 변한 사례를 먼저 보류합니다.
export function reporterExperienceIssue(draft: NewsDraft, body: string): string | null {
  const personal = /(?:^|\s)(?:나는|나도|나\s*역시|내가|필자는|기자는)(?:\s|[,，])/u;
  const group = /(?:참관\s*시민들|방문객들|참가자들|관람객들|시민들)(?:은|는|이|가)/u;
  const experience = /깨달|인식|느꼈|체험했|경험(?:을)?\s*했|반응|만족|감동/u;
  const purchase = /구매(?:했|한\s*경험|하는\s*경험)|구입했|결제했/u;
  const sourcePurchased = /(?:구매|구입|결제)(?:했|하였)|(?:샀다|샀습니다)/u;
  const groups = [
    { quote: body, paragraphs: [draft.title, draft.question, draft.answer, draft.audience] },
    ...draft.sections.map(section => ({ quote: section.quote, paragraphs: [section.heading, ...section.paragraphs] })),
  ];
  for (const section of groups) {
    for (const text of section.paragraphs) {
      // 다른 문장의 기자 경험이나 뒤에서 주어가 바뀐 설명을 집단 반응으로 보지 않습니다.
      const collectiveExperience = text.split(/[.!?。\n]/u).some(sentence =>
        [...sentence.matchAll(new RegExp(group.source, 'gu'))].some(match =>
          experience.test(sentence.slice(match.index! + match[0].length)
            .split(/(?:원문\s*)?기자는|필자는|나는|한\s*시민은/u)[0])));
      if (personal.test(section.quote) && collectiveExperience
        && !group.test(section.quote))
        return '기자 개인의 경험을 시민 전체의 반응으로 확대했습니다. 해당 원문 취재자의 경험으로 설명하세요.';
      // 구입 가능성·판매 안내는 실제 구매 경험의 증거가 아닙니다.
      const claims = [...text.matchAll(new RegExp(purchase.source, 'gu'))].filter(match =>
        !/^(?:(?:은|이)\s*없|(?:다는|다고\s*한)\s*(?:뜻|의미)(?:은|는|가)?\s*(?:아니|아닙))/u
          .test(text.slice(match.index! + match[0].length)));
      if (personal.test(body) && claims.length > 0 && !sourcePurchased.test(section.quote))
        return '원문에 없는 실제 구매 경험을 추가했습니다. 구매 가능 안내와 실제 구매 사실을 구분하세요.';
    }
  }
  return null;
}
