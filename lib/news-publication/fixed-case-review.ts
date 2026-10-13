import type { FixedCases } from './fixed-cases';
import type { NewsDraft } from './validation';

const reasons: Record<string, [string, string]> = {
  scope: ['원문 후속 지원의 대상과 기간을 확대하거나 축소하지 않았습니다.', '원문 후속 지원의 대상이나 기간을 확대 또는 축소했습니다.'],
  timeliness: ['종료된 행사와 후속 안내의 대상·시점을 구분했습니다.', '종료된 행사와 후속 안내의 대상·시점을 구분하지 못했습니다.'],
  usefulness: ['해설은 원문의 서로 다른 경력·활용 능력·관심 직무를 구분해 비교하는 판단 기준을 제공합니다.', '해설에서 경력·능력·관심 직무를 비교할 구체적인 판단 기준을 확인하지 못했습니다.'],
  clarity: ['핵심 질문에 답하고 짧은 문단으로 설명하며 내부 작업 지시를 넣지 않았습니다.', '핵심 질문에 답하지 못하거나 문단이 불명확하거나 내부 작업 지시가 있습니다.'],
  nonRepetition: ['현장 활동·경력 비교·각 사례·직무 목록이 서로 다른 정보를 설명합니다.', '같은 설명을 반복하거나 기사와 관련 없는 설명으로 분량을 채웠습니다.'],
  coverage: ['행사·후속 안내·두 참가 사례·직무 목록의 핵심 내용을 원문대로 보존했습니다.', '행사·후속 안내·참가 사례·직무 목록의 핵심 내용이 누락되거나 변형됐습니다.'],
};
const record = (value: unknown): value is Record<string, unknown> => Boolean(value)
  && typeof value === 'object' && !Array.isArray(value);
interface QualityCheck {
  passed?: unknown; reason?: unknown; decision?: unknown; detail?: unknown; excerptIndex?: unknown;
  excerpt?: string; evidenceIndexes?: unknown; excerptIndexes?: unknown; evidence?: unknown[];
}

// 항목 이름별 선택칸을 만들며 같은 번호 목록에서 임의로 여러 근거를 고르지 않습니다.
function evidenceGroups(draft: NewsDraft, key: string): Record<string, string[]> {
  return key === 'timeliness' ? { followup: [draft.answer], completed_event: [draft.sections[0].paragraphs[0]] }
    : { answer: [draft.answer], ...Object.fromEntries(draft.sections.map((section, index) => [`section_${index + 1}`, section.paragraphs])) };
}
function allowedIndexes(paragraphs: string[], excerpts: string[]): number[] {
  return excerpts.flatMap((text, index) => paragraphs.some(paragraph => paragraph.includes(text)) ? [index] : []);
}
function sourceIndexes(part: number, draft: NewsDraft, quotes: string[]): number[] {
  return quotes.flatMap((quote, index) => part === 0
    ? /(?:참여자|참가자)를\s*대상으로\s*\d{1,2}월\s*중[^.!?]{0,100}맞춤형\s*채용\s*정보를\s*(?:지속해서\s*)?연계/u.test(quote) ? [index] : []
    : quote === draft.sections[part - 1]?.quote ? [index] : []);
}

// 확인·미확인 중 하나의 이유만 받고 합격 여부는 같은 선택에서 계산합니다.
export function fixedCaseJudgmentSchema(response: { name: string; schema: Record<string, unknown> }, plan: FixedCases | null,
  excerpts: string[] = [], draft?: NewsDraft, sourceQuotes: string[] = []) {
  if (!plan) return response;
  const properties = response.schema.properties as Record<string, Record<string, unknown>>;
  const quality = properties.quality;
  const items = quality.properties as Record<string, Record<string, unknown>>;
  const limited = Object.fromEntries(Object.entries(items).map(([key, item]) => {
    const fields = item.properties as Record<string, unknown>;
    const grouped = draft && ['timeliness', 'coverage'].includes(key) ? evidenceGroups(draft, key) : null;
    const evidence = grouped ? Object.fromEntries(Object.entries(grouped).map(([name, paragraphs]) => {
      const indexes = allowedIndexes(paragraphs, excerpts);
      return [name, { type: 'integer', enum: [-1, ...indexes] }];
    })) : null;
    return [key, { type: 'object', additionalProperties: false,
      required: ['decision', 'detail', 'excerptIndex', ...(evidence ? ['evidenceIndexes'] : [])],
      properties: { decision: { type: 'string', enum: ['확인됨', '미확인'] },
        detail: { type: 'string' },
        excerptIndex: evidence ? { type: 'integer', enum: [-1, ...allowedIndexes(Object.values(grouped!).flat(), excerpts)] } : fields.excerptIndex,
        ...(evidence ? { evidenceIndexes: { type: 'object', additionalProperties: false,
          required: Object.keys(evidence), properties: evidence } } : {}) } }];
  }));
  const checks = draft && sourceQuotes.length ? { type: 'array', minItems: draft.sections.length + 1,
    maxItems: draft.sections.length + 1, items: { anyOf: Array.from({ length: draft.sections.length + 1 }, (_, part) => {
      const indexes = sourceIndexes(part, draft, sourceQuotes);
      return { type: 'object', additionalProperties: false, required: ['part', 'supported', 'quoteIndex'],
        properties: { part: { type: 'integer', enum: [part] }, supported: { type: 'boolean' },
          quoteIndex: { type: 'integer', enum: indexes.length ? indexes : [-1] } } };
    }) } } : properties.checks;
  return { ...response, schema: { ...response.schema, properties: { ...properties, checks,
    quality: { ...quality, properties: limited } } } };
}

// 불필요한 합격 표시가 섞여도 단일 판정을 따르며 실제 근거는 번호로 복원합니다.
export function fixedCaseQuality(check: QualityCheck | undefined, key: string, plan: FixedCases | null,
  excerpts: string[]): QualityCheck {
  const indexes = record(check?.evidenceIndexes) ? Object.values(check.evidenceIndexes) : undefined;
  const read = (index: unknown) => Number.isInteger(index) ? excerpts[index as number] : undefined;
  const reason = check?.decision === '확인됨' ? reasons[key]?.[0] : reasons[key]?.[1];
  return { ...check, ...(plan ? { passed: check?.decision === '확인됨',
    reason: typeof check?.detail === 'string' ? `${reason} ${check.detail}` : reason } : {}),
    excerpt: read(check?.excerptIndex), excerptIndexes: indexes, evidence: indexes?.map(read) };
}

// 응답 형식 제한과 별도로 서버에서도 항목별 근거 소속과 판정의 일치를 확인합니다.
export function fixedCaseReviewIssue(value: unknown, plan: FixedCases | null, draft?: NewsDraft): boolean {
  if (!plan) return false;
  if (!record(value) || !record(value.quality)) return true;
  for (const [key, check] of Object.entries(value.quality)) {
    if (!record(check) || !reasons[key] || check.passed !== true || typeof check.reason !== 'string'
      || !(check.reason === reasons[key][0] || check.decision === '확인됨' && typeof check.detail === 'string'
        && check.detail.trim().length >= 15 && check.reason === `${reasons[key][0]} ${check.detail}`)) return true;
    if (draft && (check.decision !== '확인됨' || typeof check.detail !== 'string' || check.detail.trim().length < 15)) return true;
    if (draft && key === 'usefulness' && typeof check.detail === 'string'
      && (!/경력/u.test(check.detail) || !/비교|판단/u.test(check.detail) || !/능력|직무/u.test(check.detail))) return true;
  }
  if (!draft) return false;
  const excerpts = [draft.answer, ...draft.sections.flatMap(section => section.paragraphs)]
    .flatMap(text => text.match(/[\s\S]{8,160}/g) ?? []);
  for (const key of ['timeliness', 'coverage']) {
    const check = value.quality[key];
    if (!record(check) || !record(check.evidenceIndexes)) return true;
    const selected = check.evidenceIndexes;
    const groups = evidenceGroups(draft, key);
    if (Object.keys(selected).length !== Object.keys(groups).length
      || Object.entries(groups).some(([name, paragraphs]) => !Number.isInteger(selected[name])
        || !allowedIndexes(paragraphs, excerpts).includes(selected[name] as number))) return true;
    const indexes = Object.values(selected);
    if (new Set(indexes).size !== indexes.length || !Number.isInteger(check.excerptIndex)
      || !allowedIndexes(Object.values(groups).flat(), excerpts).includes(check.excerptIndex as number)) return true;
  }
  return false;
}

// 원문에 있는 문장이라도 다른 사례나 현장을 가리키면 해당 부분의 근거로 수용하지 않습니다.
export function fixedCaseSourceIssue(checks: unknown, plan: FixedCases | null, draft: NewsDraft, quotes: string[]): boolean {
  if (!plan) return false;
  if (!Array.isArray(checks) || checks.length !== draft.sections.length + 1) return true;
  return Array.from({ length: draft.sections.length + 1 }, (_, part) => part).some(part => {
    const matching = checks.filter(check => record(check) && check.part === part);
    const check = matching[0];
    return matching.length !== 1 || !record(check) || check.supported !== true || !Number.isInteger(check.quoteIndex)
      || !sourceIndexes(part, draft, quotes).includes(check.quoteIndex as number);
  });
}
