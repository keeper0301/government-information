import { expect, it } from 'vitest';
import { eventEndDates } from '@/lib/news-publication/event-dates';

it('발표월을 포함한 점 표기 기간을 읽는다', () => {
  expect(eventEndDates('전시(9.22.~11.8.)', '2026-10-28')).toEqual(['2026-11-08']);
});
it('양쪽 연도가 명시된 연말 기간을 읽는다', () => {
  expect(eventEndDates('2026년 12월 20일부터 2027년 1월 5일까지')).toEqual(['2027-01-05']);
});
it.each(['12월 20일부터 1월 5일까지', '지난해 9.22.~11.8.', '2.24.~2.30.', '2026년 12월 20일부터 1월 5일까지'])(
  '추정 연도와 잘못된 날짜는 사용하지 않는다: %s', text => {
    expect(eventEndDates(text, '2026-10-28')).toEqual([]);
  });
