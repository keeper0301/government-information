import type { NewsDraft } from './validation';

// 분량 대신 기사별 실제 정보와 원문의 핵심 누락을 별도 판정합니다.
export const CONTENT_GENERATION_GUIDANCE = `내용 충실도 작성 기준:
본문의 절반 이상, 최소 두 부분은 이 기사에서만 알 수 있는 서로 다른 구체적 정보를 설명하세요. 같은 종료·예정 안내나 '공식 공고를 확인하세요'를 여러 부분으로 늘리지 마세요.
신청형은 대상별 조건과 지원 내용, 실제 접수 경로·일정 중 원문에 있는 정보를 연결하고 신청·심사·선정의 차이를 설명하세요.
변경형은 무엇이 어떻게 바뀌는지, 대상별 차이·계산 또는 차감 항목·시행 예정 상태 중 원문에 있는 핵심을 보존하세요.
문화·여행·행사형은 실제 공연·전시·체험·방문지의 내용과 이용 판단에 필요한 차이를 설명하세요. 취업 사례가 없는 기사에 경력·직무 비교를 강제하지 마세요. 종료 행사도 무엇이 열렸는지를 먼저 설명하고 종료 안내만 반복하지 마세요.
공식 문의처·이용 경로가 있으면 독자가 무엇을 문의할 수 있는지 연결하세요. 원문에 없는 요금·서류·자격·일정은 만들지 마세요. 시설 조성 계획과 현재 이용 가능한 시설을 구분하세요.
일반 조언을 제거해도 독자가 배울 내용이 남아야 합니다. 원문이 빈약해 이를 충족할 수 없으면 skip=true로 보류하세요.`;

export const CONTENT_REVIEW_GUIDANCE = `내용 충실도는 contentDepth로 별도 검사합니다. 원문 전체를 먼저 읽고 독자 판단에 중요한 누락 사실을 missingFacts에 적으세요. 없을 때만 빈 배열입니다. 원문에 없는 항목은 요구하지 마세요.
sections는 본문 번호를 키로 하는 객체입니다. "0", "1" 등 각 지정 칸에 해당 sectionIndex(0부터)의 판정을 정확히 한 번 기록하세요. 각 부분 안에서 0부터 세는 실제 본문 paragraphIndex(다른 검사 excerptIndex와 다름)와 15~240자의 구체적 reason을 제시하세요. 판정 예시를 복사하지 마세요.
role=specific은 이 기사에 고유한 조건·차이·절차·공연·체험·사례 등의 설명입니다. role=context는 필요한 주의·시점·배경, role=generic은 일반 문의 조언·같은 설명 반복·정보 없는 분량 채우기입니다. '구체적입니다' 같은 평가 대신 실제 전달 정보를 reason에 쓰세요.
다른 부분의 설명과 표현만 다르면 specific으로 세지 마세요. 최소 두 부분 및 본문의 절반 이상이 서로 다른 specific이어야 합니다. generic 부분 또는 중요한 누락 사실이 하나라도 있으면 보류합니다. 합격 표시로 누락·반복을 덮지 마세요.`;

export function contentDepthSchema(draft: Pick<NewsDraft, 'sections'>) {
  return { type: 'object', additionalProperties: false, required: ['missingFacts', 'sections'], properties: {
    missingFacts: { type: 'array', items: { type: 'string' } },
    sections: { type: 'object', additionalProperties: false,
      required: draft.sections.map((_, index) => String(index)),
      properties: Object.fromEntries(draft.sections.map((section, sectionIndex) => [String(sectionIndex), {
        type: 'object', additionalProperties: false, required: ['sectionIndex', 'paragraphIndex', 'role', 'reason'],
        properties: { sectionIndex: { type: 'integer', enum: [sectionIndex] },
          paragraphIndex: { type: 'integer', enum: section.paragraphs.map((_, index) => index) },
          role: { type: 'string', enum: ['specific', 'context', 'generic'] }, reason: { type: 'string' } },
      }])) },
  } };
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function contentDepthIssue(value: unknown, draft: NewsDraft): string | null {
  if (!record(value) || !Array.isArray(value.missingFacts) || !record(value.sections))
    return '내용 충실도 검사 결과가 누락됐습니다.';
  if (value.missingFacts.length) return '원문의 중요한 내용이 누락되어 보류했습니다.';
  if (Object.keys(value.sections).length !== draft.sections.length) return '본문별 내용 충실도 검사 개수가 맞지 않습니다.';
  const seen = new Set<number>(), specificParagraphs = new Set<string>();
  for (const [key, check] of Object.entries(value.sections)) {
    if (!record(check) || !Number.isInteger(check.sectionIndex) || !Number.isInteger(check.paragraphIndex))
      return '내용 충실도 근거 위치가 잘못됐습니다.';
    const sectionIndex = check.sectionIndex as number, paragraphIndex = check.paragraphIndex as number;
    const paragraph = draft.sections[sectionIndex]?.paragraphs[paragraphIndex];
    if (key !== String(sectionIndex) || seen.has(sectionIndex) || !paragraph) return '내용 충실도 근거가 중복되거나 본문에 없습니다.';
    seen.add(sectionIndex);
    if (!['specific', 'context', 'generic'].includes(check.role as string) || typeof check.reason !== 'string'
      || check.reason.trim().length < 15 || check.reason.length > 240) return '내용 충실도 판정이나 이유가 부족합니다.';
    if (check.role === 'generic') return '일반 조언이나 반복 설명으로 채운 본문이 있어 보류했습니다.';
    if (check.role === 'specific') specificParagraphs.add(paragraph.replace(/\s+/g, ' ').trim());
  }
  return specificParagraphs.size >= Math.max(2, Math.ceil(draft.sections.length / 2))
    ? null : '기사 고유의 구체적인 정보가 부족해 보류했습니다.';
}
