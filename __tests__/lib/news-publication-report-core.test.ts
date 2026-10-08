import { afterEach, expect, it, vi } from 'vitest';
import { collectReportCore, reportCoreIssue, reportAnalysisParagraphs } from '@/lib/news-publication/report-core';
import { newsDraftIssue } from '@/lib/news-publication/validation';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/llm/text', () => ({ callLLM: mock.call, parseJSONResponse: JSON.parse }));
import { generateVerifiedNews } from '@/lib/news-publication/generate';
afterEach(() => mock.call.mockReset());

const event = '지난 10월 1일 서울중장년내일센터에서 행사를 개최했다.';
const followUp = '이번 행사는 참여자를 대상으로 10월 중 한국관광공사 관광일자리센터를 통한 맞춤형 채용 정보를 지속해서 연계한다는 점에서 차별성을 지닌다.';

it('종료 행사와 같은 문장의 후속 안내가 확인되면 핵심 답변을 원문 범위로 고정한다', () => {
  const core = collectReportCore(event + '\n' + followUp, [event, followUp]);
  expect(core?.answer).toContain('참여자를 대상으로 10월 중');
  expect(core?.answer).not.toMatch(/한해|만 이용|한 달/);
  expect(reportCoreIssue(core, { kind: 'report', ...core })).toBeNull();
  expect(reportCoreIssue(core, { kind: 'report', ...core, answer: '참가자에 한해 채용 정보를 제공합니다.' })).toContain('핵심 안내');
});

it('별도 문장의 대상과 기간을 연결하거나 신청 기사를 행사로 추측하지 않는다', () => {
  expect(collectReportCore(event, ['참여자를 대상으로 지원합니다.', '10월 중 채용 정보를 연계합니다.'])).toBeNull();
  expect(collectReportCore(followUp, [followUp])).toBeNull();
  expect(reportCoreIssue(null, { answer: '기존 작성 흐름' })).toBeNull();
});

it('참가자의 희망·부정·여러 후속 안내는 확정 핵심 답변으로 고정하지 않는다', () => {
  for (const quote of [followUp + '라는 희망을 밝혔다.', followUp + '라는 뜻은 아니다.'])
    expect(collectReportCore(event + '\n' + quote, [event, quote])).toBeNull();
  const second = followUp.replace('10월', '11월');
  expect(collectReportCore(event + followUp + second, [event, followUp, second])).toBeNull();
});

it('후속 안내 미확인·부인이나 개최 부정을 긍정 안내로 고정하지 않는다', () => {
  for (const ending of ['연계한다는 점은 확인되지 않았다.', '연계한다는 점을 부인했다.']) {
    const quote = followUp.replace('연계한다는 점에서 차별성을 지닌다.', ending);
    expect(collectReportCore(event + '\n' + quote, [event, quote])).toBeNull();
  }
  const denied = '지난 10월 1일 개최했다는 보도는 사실이 없다.';
  expect(collectReportCore(denied + '\n' + followUp, [denied, followUp])).toBeNull();
});

it('유사한 숫자나 서로 다른 기사 종류로 고정 안내를 우회하지 않는다', () => {
  const invalidMonth = followUp.replace('10월', '110월');
  expect(collectReportCore(event + invalidMonth, [event, invalidMonth])).toBeNull();
  expect(collectReportCore(event, [followUp])).toBeNull();
  const core = collectReportCore(event + followUp, [event, followUp]);
  expect(reportCoreIssue(core, { ...core, kind: 'application' })).toContain('핵심 안내');
  expect(reportCoreIssue(core, null)).not.toBeNull();
});

it('원문에 없는 이용 제한을 핵심 답변에 쓰면 두 작성 응답 모두 보류한다', async () => {
  const body = event + '\n' + followUp;
  const core = collectReportCore(body, [event, followUp]);
  mock.call.mockImplementation(async request => {
    expect(request.prompt).toContain('원문에 없는 참가 사례나 비교 대상을 만들지 마세요');
    expect(request.responseSchema.schema.properties.answer.enum).toEqual([core?.answer]);
    expect(request.responseSchema.schema.properties.kind.enum).toEqual(['report']);
    return JSON.stringify({ ...core, kind: 'report', title: '관광 직무 행사와 후속 지원의 범위',
      answer: '참가자에 한해 채용 정보를 제공합니다.', sections: [
        { heading: '행사 소식과 종료 상태', caseIndex: -1, quoteIndex: 0, paragraphs: ['행사가 끝난 소식이며 지금 참가 신청을 받고 있다는 공고가 아닙니다.'] },
        { heading: '후속 지원의 대상과 기간', caseIndex: -1, quoteIndex: 1, paragraphs: ['후속 지원의 범위는 행사 참여자에 대한 안내로 읽어야 합니다.'] },
        { heading: '독자가 구분할 수 있는 정보', caseIndex: -1, quoteIndex: 1, paragraphs: ['일반 구직자의 이용 가능 여부와 후속 지원의 범위를 구분해야 합니다.'] },
      ] });
  });
  await expect(generateVerifiedNews({ title: '행사 공식 기사', body, hash: '원문 식별값', publishedAt: '2026-10-06',
    url: 'https://www.korea.kr/news/customizedNewsView.do?newsId=148972905' })).rejects.toThrow('고정한 핵심 안내');
  expect(mock.call).toHaveBeenCalledTimes(2);
});

it('대략 인원을 확정 인원으로 쓰면 보류하고 여 명 원문 표기를 안내한다', () => {
  const body = event + '\n' + followUp + '\n참가자는 70여 명이었다.';
  const core = collectReportCore(body, [event, followUp]);
  const draft = { ...core, kind: 'report', title: '종료된 관광 행사와 후속 채용 정보',
    sections: [
      { heading: '행사 현장과 종료 상태', quote: followUp, paragraphs: ['행사 참여자의 경력과 관심 분야를 실제 직무와 연결하는 관점에서 설명합니다. 현장 상담에 참여한 사람이 들은 조언을 현재 이용 가능한 모집 공고로 바꾸어 이해해서는 안 되며, 이미 끝난 행사라는 점과 채용 정보 연계를 구분합니다.'] },
      { heading: '후속 채용 정보 안내', quote: followUp, paragraphs: ['후속 정보는 원문에서 확인한 대상과 기간의 범위 안에서 안내됩니다. 참가자의 사례가 소개되었다는 사실만으로 일반 독자도 같은 후속 지원을 받는다고 단정할 수 없으며, 원문에 제시되지 않은 이용 자격이나 신청 서류를 임의로 추가할 수 없습니다.'] },
      { heading: '직무 선택의 판단 기준', quote: followUp, paragraphs: ['직무를 고를 때는 자신이 해 온 업무와 앞으로 맡을 일의 차이를 함께 살펴볼 수 있습니다. 한 참가자의 자신감은 모든 사람에게 적용되는 취업 결과와 다르며, 사례를 읽을 때는 실제 경력과 희망하는 직무를 연결한 과정에 주목할 수 있습니다.'] },
    ] };
  expect(newsDraftIssue({ ...draft, answer: '참가자는 약 70명이었습니다.' }, body)).toContain('70명 → 70여명');
  expect(newsDraftIssue({ ...draft, answer: '참가자는 70여 명이었습니다.' }, body)).toBeNull();
});

it('해설 근거는 표시된 해설 본문만 선택하며 제목이나 일반 안내로 대신하지 않는다', () => {
  const core = collectReportCore(event + followUp, [event, followUp]);
  const sections = [
    { heading: '키피오의 해설: 경력과 직무 비교', paragraphs: ['영업 경험과 행정 경험을 서로 다른 직무와 연결해 비교합니다.'] },
    { heading: '후속 지원 대상 안내', paragraphs: ['원문에 확인된 후속 지원의 대상과 기간입니다.'] },
  ];
  expect(reportAnalysisParagraphs(core, { sections })).toEqual(sections[0].paragraphs);
  expect(reportAnalysisParagraphs(core, { sections: sections.slice(1) })).toEqual([]);
  expect(reportAnalysisParagraphs(null, { sections })).toEqual([]);
});
