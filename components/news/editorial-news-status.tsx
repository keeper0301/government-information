import type { EditorialNews } from '@/lib/editorial-news-data';
import { getNewsStatus, NEWS_STATUSES } from '@/lib/editorial-news-status';

export function EditorialNewsStatus({ article, detail = false }: { article: EditorialNews; detail?: boolean }) {
  const status = getNewsStatus(article);
  return <div className="my-3 text-sm text-grey-700">
    <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 font-semibold">{NEWS_STATUSES.find(item => item.code === status)?.name}</span>
    {detail && <p className="mt-2 leading-relaxed">{article.schedule
      ? `원문 안내 기간: ${article.schedule.start} ~ ${article.schedule.end}. 휴관일·회차·예약 가능 여부는 공식 안내에서 확인하세요.`
      : status === 'planned' ? '발표 당시 예정·추진 단계의 소식입니다. 예정일이 지나도 실제 시행 여부는 공식 기관에서 다시 확인하세요.'
      : status === 'ended' ? '종료된 일정에 관한 소식입니다. 다음 회차 모집을 뜻하지 않습니다.'
      : status === 'mixed' ? '종료된 행사와 다른 일정이 함께 안내되어 있습니다. 프로그램별 날짜를 구분해서 확인하세요.'
      : '현재 신청·이용 가능 여부를 뜻하지 않습니다. 공식 기관의 최신 안내를 확인하세요.'}</p>}
  </div>;
}
