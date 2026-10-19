import { expect, it } from 'vitest';
import { sourceStateIssue } from '@/lib/news-publication/source-state';
import type { NewsDraft } from '@/lib/news-publication/validation';
import { classifyEditorialNews } from '@/lib/news-publication/classification';
import { getEditorialNewsPhoto } from '@/lib/editorial-news-images';

const body = '교육부는 15일 안전 확보를 위한 업무협약을 체결한다. 기존 학교로 확대 여부는 의견을 고려해 검토할 예정이다.';
const draft = (text: string): NewsDraft => ({ kind: 'change', title: '학교 태양광 안전검사 개선 안내',
  question: '어떤 학교에 적용하나요?', answer: '햇빛이음학교에 우선 적용합니다.', audience: '학교 관리자',
  sections: [{ heading: '확대 여부 검토', paragraphs: [text], quote: body }] });

it.each(['교육부는 안전 강화 업무협약을 체결했다.', '업무협약이 체결됐다.',
  '앞으로 점진적으로 더 많은 학교에 대한 안전검사 강화가 이루어질 전망이다.',
  '기존 학교로 확대될 예정이다.', '확대 적용이 예상된다.'])('실제 오류와 변형을 보류한다: %s', text => {
  expect(sourceStateIssue(draft(text), body)).not.toBeNull();
});
it.each(['교육부는 협약을 체결할 예정이라고 발표했다.', '기존 학교로 확대 여부는 추후 검토한다.',
  '확대 적용 여부는 아직 정해지지 않았다.'])('원문의 유보 상태를 보존한다: %s', text => {
  expect(sourceStateIssue(draft(text), body)).toBeNull();
});
it('완료 사실이 원문에 직접 있는 경우 허용한다', () => {
  const text = '교육부는 별도 업무협약을 체결했다.';
  expect(sourceStateIssue(draft(text), body + text)).toBeNull();
});
it('제목과 핵심 답변에도 같은 검사를 적용한다', () => {
  const value = draft('확대 여부는 검토 예정이다.');
  value.title = '더 많은 학교로 확대될 전망';
  expect(sourceStateIssue(value, body)).not.toBeNull();
});
it.each(['협약을 체결했다는 의미는 아닙니다.', '확대될 전망이라는 뜻은 아닙니다.'])('직접 부정은 허용한다: %s', text => {
  expect(sourceStateIssue(draft(text), body)).toBeNull();
});
it('원문 부정문에서 완료 단정만 잘라내면 보류한다', () => {
  expect(sourceStateIssue(draft('학교 태양광 협약을 체결했다.'), body + '학교 태양광 협약을 체결했다는 뜻은 아니다.')).not.toBeNull();
});
it('다른 사업의 완료 문구 일부를 빌리면 보류한다', () => {
  expect(sourceStateIssue(draft('협약을 체결했다.'), body + '지난해 풍력 사업은 협약을 체결했다.')).not.toBeNull();
});
it('체결 방침과 확대합니다 표현도 검사한다', () => {
  expect(sourceStateIssue(draft('학교 협약을 체결했다.'), '학교 협약을 체결할 방침이다.')).not.toBeNull();
  expect(sourceStateIssue(draft('학교 태양광 사업을 확대합니다.'), body)).not.toBeNull();
});
it.each(['학교 태양광 협약이 체결됐습니다.', '학교 태양광 협약 체결을 완료했습니다.',
  '학교 태양광 확대가 확정됐지만 전국 확대가 확정이라는 뜻은 아닙니다.'])('완료 어미와 같은 문장 뒤 절의 부정으로 우회하지 않는다: %s', text => {
  expect(sourceStateIssue(draft(text), body)).not.toBeNull();
});
it('새 태양광 기사는 에너지로 분류하고 허가된 자료사진을 연결한다', () => {
  const title = '학교 태양광 설비 안전검사 강화';
  expect(classifyEditorialNews(title).benefits).toEqual(['에너지']);
  const photo = getEditorialNewsPhoto({ slug: '새로운-자동기사', title });
  expect(photo?.url).toBe('/images/news/solar-panels.webp');
  expect(photo?.caption).toContain('해당 학교 현장 사진이 아닙니다');
  expect(getEditorialNewsPhoto({ slug: '새로운-자동기사', title, photoPolicy: 'official-only' })).toBeNull();
});
