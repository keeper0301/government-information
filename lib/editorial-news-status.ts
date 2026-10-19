import type { EditorialNews } from './editorial-news-data';

export const NEWS_STATUSES = [
  { code: 'ongoing', name: '안내 기간 내' },
  { code: 'planned', name: '예정 발표' },
  { code: 'ended', name: '종료 안내' },
  { code: 'mixed', name: '여러 일정' },
  { code: 'information', name: '일반 소식·확인 필요' },
] as const;
export type NewsStatus = typeof NEWS_STATUSES[number]['code'];

export function getNewsStatus(article: Pick<EditorialNews, 'title' | 'schedule'>, today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })): NewsStatus {
  const schedule = article.schedule;
  // 원문 인용과 시작·종료일을 확인한 일정만 오늘과 비교합니다. 예정일 경과만으로 시행 중으로 바꾸지 않습니다.
  if (schedule?.evidence && validDate(schedule.start) && validDate(schedule.end) && schedule.start <= schedule.end) {
    if (today < schedule.start) return 'planned';
    if (today > schedule.end) return 'ended';
    return 'ongoing';
  }
  const ended = /종료|접수 마감|행사 마감/.test(article.title);
  const planned = /예정|추진|계획|검토/.test(article.title);
  if (ended && (planned || /온라인.*\d+월\s*\d+일\s*까지/.test(article.title))) return 'mixed';
  if (ended) return 'ended';
  if (planned) return 'planned';
  return 'information';
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
