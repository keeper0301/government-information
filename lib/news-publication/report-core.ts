export interface ReportCore { question: string; answer: string; audience: string }

// 종료 행사와 명시적 후속 채용 안내가 함께 있는 한정된 원문만 처리합니다.
// 여러 문장의 대상·기간을 연결하거나 참가자의 희망을 확정 지원으로 해석하지 않습니다.
export function collectReportCore(body: string, quotes: string[]): ReportCore | null {
  const uncertain = /희망|바란|바라|제안|제언|아니|연계하지|확인되지|확인하지|미확인|부인|허위|거짓|사실이\s*없/u;
  const verifiedQuotes = quotes.filter(quote => body.replace(/\s+/g, ' ').includes(quote.replace(/\s+/g, ' '))
    && !uncertain.test(quote));
  if (!verifiedQuotes.some(quote => /지난\s*\d{1,2}월\s*\d{1,2}일[^.!?。\n]{0,180}개최했다(?:[.!?。]|\s*$)/u.test(quote))) return null;
  const candidates = verifiedQuotes.flatMap(quote => {
    const matches = [...quote.matchAll(/(?:행사\s*)?(참여자|참가자)를\s*대상으로\s*(\d{1,2}월\s*중)\s+[^.!?。]{0,100}맞춤형\s*채용\s*정보를\s*(?:지속해서\s*)?연계한다는\s*점/gu)];
    return matches.map(match => ({ audience: match[1], period: match[2].replace(/\s+/g, ' ') }));
  });
  if (candidates.length !== 1) return null;
  const { audience, period } = candidates[0];
  return {
    question: '행사 후속 채용 정보는 누구를 대상으로 언제 안내되었나요?',
    answer: `원문은 ${audience}를 대상으로 ${period} 맞춤형 채용 정보를 연계한다고 안내합니다. 행사 현장 설명과 후속 지원의 대상·시점을 구분해서 읽어야 합니다.`,
    audience: `행사 ${audience} 대상 후속 채용 정보`,
  };
}

// 응답 형식을 어기더라도 고정한 안내를 다시 해석한 초안을 공개하지 않습니다.
export function reportCoreIssue(core: ReportCore | null, value: unknown): string | null {
  if (!core) return null;
  const draft = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  return draft?.kind === 'report' && Object.entries(core).every(([key, text]) => draft[key] === text)
    ? null : '원문으로 확인해 고정한 핵심 안내와 다르게 작성했습니다.';
}

// 표시만으로 해설 품질을 합격시키지 않습니다. 내용은 별도 품질 판정에서 다시 대조합니다.
export function reportAnalysisParagraphs(core: ReportCore | null, value: unknown): string[] {
  if (!core || !value || typeof value !== 'object') return [];
  const sections = (value as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return [];
  return sections.flatMap(section => section && typeof section.heading === 'string'
    && section.heading.startsWith('키피오의 해설') && Array.isArray(section.paragraphs)
    ? section.paragraphs.filter((text: unknown): text is string => typeof text === 'string') : []);
}
