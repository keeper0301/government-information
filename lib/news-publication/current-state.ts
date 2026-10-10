import type { NewsDraft } from './validation';

// 명시적인 현재 시행 표현만 검사하며 발표·개정 사실 자체를 시행으로 해석하지 않습니다.
const currentState = /시행\s*(?:중(?!단)|되고\s*있|하고\s*있)/gu;
const sentences = (text: string) => text.match(/[^.!?。\n]+[.!?。]?/gu) ?? [];

function claims(text: string, original: boolean): string[] {
  const result: string[] = [];
  for (const sentence of sentences(text)) {
    for (const match of sentence.matchAll(currentState)) {
      const prefix = sentence.slice(0, match.index);
      const tail = sentence.slice(match.index + match[0].length).replace(/[“”‘’"']/gu, '').trim();
      // 해당 시행 표현의 질문·부정·조건만 제외합니다. 다음 문장의 부정으로 덮지 않습니다.
      const qualified = /^(?:이\s*)?아(?:니|닙)|^(?:이?라는|이라는|인)\s*(?:뜻|의미|사실)(?:은|는|이|가)?\s*아(?:니|닙)/u.test(tail)
        || /^(?:인가|입니까|인가요|일까요|나요|습니까)[.!?。]?\s*$/u.test(tail)
        || /^(?:인지|인지는)\s*(?:미확인|알\s*수\s*없|확인(?:할\s*수\s*없|하지\s*못|이\s*필요|해야))/u.test(tail)
        || /^(?:일\s*경우|이라면|인\s*경우)/u.test(tail)
        || /^(?:일|할)\s*(?:예정|계획)/u.test(tail)
        || /^지\s*않/u.test(tail)
        || /^(?:으로|이라고|이라고는|이라는\s*표현(?:으로|을)?)\s*(?:단정|확정|확인)(?:할\s*수\s*없|하지\s*못|되지\s*않)/u.test(tail);
      if (qualified) continue;
      // 예정·희망·계획 문장을 현재 시행 근거로 빌리지 않습니다.
      if (original && (/예정|계획|방침|희망|기대|내년|향후|앞으로/u.test(prefix) || /^인지/u.test(tail))) continue;
      // 과거·전언·오보·목표는 현재 긍정 확정 문장으로 인정하지 않습니다.
      if (original && (/[“”‘’"']/u.test(sentence)
        || !/^(?:이다|입니다|다|습니다)[.!。]?\s*$/u.test(tail))) continue;
      const subject = prefix.replace(/[“”‘’"']/gu, '').trim()
        .replace(/^(?:현시점에서|현재|지금|이미)\s*/u, '').replace(/\s+/gu, '').toLowerCase();
      // 시행 주체까지 보존한 짧은 절을 비교합니다. 상태 단어만 같다고 허용하지 않습니다.
      result.push(subject + '시행중');
    }
  }
  return result;
}

export function currentStateIssue(draft: NewsDraft, body: string): string | null {
  const originals = new Set(claims(body, true));
  const fields = [draft.title, draft.question, draft.answer, draft.audience,
    ...draft.sections.flatMap(section => [section.heading, ...section.paragraphs])];
  for (const text of fields) {
    for (const claim of claims(text, false)) {
      if (claim === '시행중' || !originals.has(claim))
        return '원문에서 확인하지 못한 현재 시행 상태입니다. 시행 주체와 상태를 원문 문장으로 직접 확인하거나 해당 단정을 제거하세요.';
    }
  }
  return null;
}
