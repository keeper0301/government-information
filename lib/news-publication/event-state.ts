import type { NewsDraft } from './validation';

const sentences = (text: string) => text.split(/[.!?。\n]/u).map(part => part.trim()).filter(Boolean);
// 날짜가 지났다는 이유로 원문의 예고를 완료 사실로 바꾸지 않습니다.
const rules = [
  { planned: /(?:행사|개막|공연|전시|축제|기념식|문화주간)[^.。!?]{0,100}(?:개최한다|개최합니다|개최된다|개최됩니다|열린다|열립니다|열릴|연다|엽니다|개막한다|개막합니다|진행한다|진행합니다|진행된다|진행됩니다|진행할|개최할|개최\s*예정)/u,
    completed: /(?:(?:개최|개막|진행)(?:했다|했습니다|하였습니다|하였다|됐|되었)|열렸|열었다|열었습니다)/gu },
  { planned: /(?:표창|상장|상|시상)[^.。!?]{0,60}(?:수여한다|수여합니다|수여할|받는다|받습니다|받을|수상한다|수상할)/u,
    completed: /(?:수여(?:했다|했습니다|되었다|됐|되었)|(?:표창|상장|상)을?\s*받았|수상(?:했다|했습니다))/gu },
  { planned: /(?:공연|패션쇼|무대|브랜드)[^.。!?]{0,100}(?:시작하며|선보인다|펼친다|참여할|예정)/u,
    completed: /(?:참여했다|참여했습니다|무대를?\s*시작했|공연을?\s*펼쳤|선보였다)/gu },
];

const negation = /(?:뜻|의미)(?:은|는|가|이)?\s*아(?:니|닙)|(?:지|수)\s*(?:않|없|못)/u;
function supportsCompleted(sentence: string, original: string[], completed: RegExp): boolean {
  // 조사와 어순만 다른 요약은 허용하되 이름·장소·날짜를 다른 행사에서 빌리지 않습니다.
  // 완료 판정은 연결 어미도 잡고, 근거 비교에서는 남은 높임말 어미만 함께 지웁니다.
  const evidenceVerb = new RegExp(`(?:${completed.source})(?:습니다|다)?`, 'gu');
  const tokens = (text: string) => text.replace(evidenceVerb, '').split(/\s+/u)
    .map(word => word.replace(/[^\p{L}\p{N}]/gu, '').replace(/(?:에서는|에서|으로|에게|에는|은|는|이|가|을|를|의|에|와|과)$/u, ''))
    .filter(word => word.length >= 2 && !/^(?:지난|이번|개최)$/u.test(word));
  const claims = tokens(sentence);
  if (claims.length < 3) return false;
  return original.some(text => new RegExp(completed.source, 'u').test(text) && !negation.test(text)
    && claims.every(word => tokens(text).includes(word)));
}

export function eventStateIssue(draft: NewsDraft, body: string): string | null {
  const original = sentences(body);
  const fields = [draft.title, draft.question, draft.answer, draft.audience,
    ...draft.sections.flatMap(section => [section.heading, ...section.paragraphs])];
  for (const sentence of fields.flatMap(sentences)) {
    // 정확히 보존한 완료 문장이 있으면 다른 예정 행사가 함께 있어도 허용합니다.
    if (original.some(text => text.replace(/\s/gu, '') === sentence.replace(/\s/gu, ''))) continue;
    for (const rule of rules) {
      if (!original.some(text => rule.planned.test(text))) continue;
      if (supportsCompleted(sentence, original, rule.completed)) continue;
      for (const match of sentence.matchAll(rule.completed)) {
        const tail = sentence.slice(match.index + match[0].length);
        if (/^(?:다는|라는|는|다고\s*하는)\s*(?:뜻|의미)(?:은|는|가|이)?\s*아(?:니|닙)/u.test(tail)) continue;
        return '원문의 행사·시상·공연 예고를 완료 사실로 바꿨습니다. 원문에 확인된 예정 상태를 보존하세요.';
      }
    }
  }
  return null;
}
