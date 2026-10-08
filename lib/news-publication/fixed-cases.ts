import type { SourceFacts } from './source-facts';

interface TextSection {
  heading: string; paragraphs: string[]; quoteIndex: number; caseIndex: number;
  quote: string;
}
interface FixedSection extends TextSection { sourceCase: true }
export interface FixedCases { sections: FixedSection[]; analysis: TextSection & { sourceAnalysis: true }; event: TextSection & { sourceEvent: true } }
const headings = ['현장에서 확인한 활동', '키피오의 해설: 경력과 직무 비교'];
const record = (value: unknown): value is Record<string, unknown> => Boolean(value)
  && typeof value === 'object' && !Array.isArray(value);
const uncertain = /확인되지|미확인|사실이\s*아니|허위|거짓|부인/u;
// 행사 관련 문장의 부정·취소·미래·가정을 완료된 활동으로 읽지 않습니다.
const incomplete = /아니|않|못|없|취소|예정|희망|바란|제안|제언|불참|미실시|미진행|다면|으면/u;
const positiveEvent = (text: string) => !uncertain.test(text) && !incomplete.test(text);

// 확인된 두 서술 형식만 처리합니다. 필수 경력·현장 경험·개인 희망이 없으면 추측하지 않습니다.
export function collectFixedCases(facts: SourceFacts, quotes: string[]): FixedCases | null {
  if (facts.cases.length !== 2) return null;
  if (quotes.some(text => /행사|참석|토크콘서트|멘토링/u.test(text)
    && /취소|사실이\s*아니|허위|미실시|미진행|하지\s*않|되지\s*않/u.test(text))) return null;
  const sections = facts.cases.flatMap((person, caseIndex) => {
    const quoteIndex = person.quoteIndexes[0];
    const quote = quotes[quoteIndex];
    if (!quote?.includes(person.label)) return [];
    const end = facts.cases[caseIndex + 1]?.quoteIndexes[0] ?? quotes.length;
    const scope = quotes.slice(quoteIndex, end);
    if (scope.some(text => uncertain.test(text))) return [];
    const reference = new RegExp(`^${person.name[0]}\\s*씨는`, 'u');
    const own = scope.filter(text => reference.test(text));
    const prefix = `원문에서 소개한 ${person.label}: `;
    let paragraphs: string[];
    const career = quote.match(/^(.{2,15})에서\s*(\d{1,3}년\s*넘게)\s*(.{2,25})\s*업무를 하다\s*(작년에|지난해에?|올해에?)\s*퇴직했다는/u);
    const interest = quote.match(/평소 관심 있던\s*(.{2,25})\s*분야에 도전/u);
    const coaching = own.find(text => /현직 가이드/u.test(text) && /초기 진입/u.test(text)
      && /시행착오/u.test(text) && /도움이 됐다/u.test(text));
    const confidence = coaching ? scope[scope.indexOf(coaching) + 1] : undefined;
    const work = quote.match(/^(.{2,25})\s*부스에서 집중적인 상담을 마친/u);
    const previous = quote.match(/과거\s*(.{2,25})\s*경험을 살려 경력 전환을 준비 중이다/u);
    const encouragement = own.find(text => /나이로 인한 진입 장벽/u.test(text)
      && /환자를 편안하게 돌보고 조율/u.test(text) && /꼼꼼함/u.test(text)
      && /멘토의 격려/u.test(text) && /용기를 얻었다/u.test(text));
    const wish = own.find(text => /단기 교육/u.test(text) && /인턴십 연계/u.test(text)
      && /확대되기를 바란다/u.test(text) && /제언/u.test(text));
    if (career && interest && coaching && confidence && /^이어\s/u.test(confidence)
      && /소통 능력/u.test(confidence) && /관광 통역 현장/u.test(confidence) && /자신감을 얻었다/u.test(confidence)) {
      paragraphs = [
        `이전 경력: ${career[1].trim()}의 ${career[3].trim()} 업무. 원문에 나온 근무 기간은 '${career[2].trim()}'입니다. 퇴직 시점은 '${career[4]}'라고 설명합니다.`,
        `관심 분야는 ${interest[1].trim()}입니다. 현직 가이드가 전한 강점과 초기 진입의 시행착오가 도움이 됐다고 말했습니다.`,
        '소통 능력을 관광 통역 현장에 연결할 자신감을 얻었다고 원문은 소개합니다. 취업이나 경력 전환 성공이 확정됐다는 사례가 아닙니다.',
      ];
    } else if (work && previous && encouragement && wish) {
      paragraphs = [
        `이전 경력: ${previous[1].trim()}. 관심 직무: ${work[1].trim()}. 원문은 이 경력을 살려 경력 전환을 준비 중인 참가자로 소개합니다.`,
        '나이에 따른 진입 장벽을 걱정했습니다. 환자 돌봄과 조율에 연륜·꼼꼼함이 강점이 된다는 멘토의 격려에 용기를 얻었습니다.',
        '단기 교육·인턴십 연계 확대는 이 참가자가 바란 내용입니다. 기관의 확정 계획으로 소개한 것이 아닙니다.',
      ];
    } else return [];
    return [{ heading: `${person.name}의 원문 경력과 경험`, paragraphs: paragraphs.map(text => prefix + text),
      quoteIndex, caseIndex, quote, sourceCase: true as const }];
  });
  if (sections.length !== facts.cases.length) return null;
  const business = sections.find(section => section.paragraphs[0].includes('근무 기간은'));
  const clinical = sections.find(section => section.paragraphs[0].includes('관심 직무:'));
  if (!business || !clinical) return null;
  const businessWork = business.paragraphs[0].match(/의 (.+?) 업무\./u)?.[1];
  const previousWork = clinical.paragraphs[0].match(/이전 경력: (.+?)\./u)?.[1];
  const clinicalWork = clinical.paragraphs[0].match(/관심 직무: (.+?)\./u)?.[1];
  if (!businessWork || !previousWork || !clinicalWork) return null;
  const analysis: FixedCases['analysis'] = { heading: headings[1], caseIndex: -1, quoteIndex: business.quoteIndex, quote: business.quote,
    sourceAnalysis: true, paragraphs: [
      `키피오의 제안: ${businessWork} 경력은 소통 능력과, ${previousWork} 경력은 원문이 설명한 환자 돌봄·조율의 강점과 연결해 관심 직무를 비교해 볼 수 있습니다. 이는 두 사례를 읽는 판단 기준이며, 채용 결과나 자격 조건을 정한 안내가 아닙니다.`,
      `이전에 했던 업무·그때 활용한 능력·관심 직무를 나눠 적어 보세요. 원문의 관광 통역 사례는 소통 경험을, ${clinicalWork} 사례는 돌봄·조율에 대한 멘토의 격려를 소개했습니다. 본인의 실제 활동을 비교하는 것이 키피오의 제안입니다.`,
    ] };
  const events = quotes.flatMap((text, index) => {
    const match = text.match(/지난\s*(\d{1,2}월\s*\d{1,2}일)\s*(.{2,35}?)에서\s*[^.!?]*개최했다(?:[.!?。]|\s*$)/u);
    return match && positiveEvent(text) ? [{ date: match[1], place: match[2], quoteIndex: index }] : [];
  });
  const attendance = quotes.flatMap(text => {
    const match = text.match(/중장년 구직자\s*(\d+여\s*명)이 참석(?:해\s|했(?:다|습니다)(?:[.!?。]|\s*$))/u);
    return match && positiveEvent(text.slice(match.index)) ? [match[1]] : [];
  });
  if (events.length !== 1 || attendance.length !== 1 || !quotes.some(text => positiveEvent(text)
    && /직무 토크콘서트.*참여(?:해\s|했습니다[.!?。])/u.test(text))
    || !quotes.some(text => positiveEvent(text) && /직무별 부스.*1:1\s*멘토링.*이어졌(?:다|습니다)[.!?。]/u.test(text))
    || !quotes.some(text => positiveEvent(text) && /진입 장벽.*필요한 자격증.*실제 근무 형태.*질문(?:하며\s|했습니다[.!?。])/u.test(text))) return null;
  const event: FixedCases['event'] = { heading: headings[0], caseIndex: -1, quoteIndex: events[0].quoteIndex, quote: quotes[events[0].quoteIndex], sourceEvent: true,
    paragraphs: [`원문은 ${events[0].date} ${events[0].place}에서 관광 분야 직무 전환 행사를 개최했다고 소개합니다. 중장년 구직자 ${attendance[0]}이 참석했으며 직무 토크콘서트가 진행됐습니다.`,
      '직무별 부스에서 1:1 멘토링이 이어졌습니다. 참여자들은 진입 장벽·필요한 자격증·실제 근무 형태를 질문하며 현직 전문가의 조언을 들었습니다.'] };
  return { sections, analysis, event };
}

// 기존 사례를 조용히 덮어쓰지 않습니다. 잘못된 응답은 별도 검사에서 보류합니다.
export function attachFixedCases(value: unknown, plan: FixedCases | null): unknown {
  if (!plan || !record(value) || !Array.isArray(value.sections) || value.sections.length !== 1
    || !value.sections.every(section => record(section) && section.caseIndex === -1)) return value;
  return { ...value, sections: [...value.sections, structuredClone(plan.analysis), ...structuredClone(plan.sections)] };
}

export function fixedCaseIssue(value: unknown, plan: FixedCases | null): string | null {
  if (!plan) return null;
  if (!record(value) || !Array.isArray(value.sections)) return '고정 참가 사례의 본문 형식이 맞지 않습니다.';
  const actual = value.sections.filter(section => record(section) && section.sourceCase === true);
  const same = actual.length === plan.sections.length && plan.sections.every((expected, index) =>
    record(actual[index]) && Object.entries(expected).every(([key, text]) => JSON.stringify(actual[index][key]) === JSON.stringify(text)));
  const analysis = value.sections.filter(section => record(section) && section.sourceAnalysis === true);
  const sameAnalysis = analysis.length === 1 && record(analysis[0]) && Object.entries(plan.analysis)
    .every(([key, text]) => JSON.stringify(analysis[0][key]) === JSON.stringify(text));
  const model = value.sections.filter(section => record(section) && !section.sourceCase && !section.sourceAnalysis && !section.sourceFactList);
  const sameEvent = model.length === 1 && record(model[0]) && Object.entries(plan.event)
    .every(([key, text]) => JSON.stringify(model[0][key]) === JSON.stringify(text));
  return same && sameAnalysis && sameEvent
    ? null : '고정 참가 사례·비교 해설을 바꾸거나 현장 설명을 누락·중복했습니다.';
}

// 확인된 원문 서술 형식은 새 사실을 생성하지 않고 검증할 기사로 조립합니다.
export function fixedReportDraft(plan: FixedCases, core: { question: string; answer: string; audience: string } | null) {
  return { skip: false, kind: 'report', title: '관광 직무 상담에서 확인한 중장년 경력과 후속 안내',
    ...core, sections: [structuredClone(plan.event)] };
}

export { fixedCaseJudgmentSchema, fixedCaseReviewIssue, fixedCaseQuality, fixedCaseSourceIssue } from './fixed-case-review';
