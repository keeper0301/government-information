import { getGuides } from './policy-guides';

// 관련 가이드의 일시적인 조회 실패가 분류 페이지 전체의 배포를 막지 않도록 제한합니다.
export async function loadCategoryGuides(category: string) {
  try {
    const guides = await getGuides(50, { categorySlugs: [category], publicationOnly: true,
      signal: AbortSignal.timeout(10000) });
    return { guides, unavailable: false };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'Guide data temporarily unavailable') throw error;
    const cause = error.cause as { status?: number; code?: string; message?: string; details?: string } | undefined;
    // 인증·권한·잘못된 요청·저장소 설정 오류는 연결 장애로 숨기지 않습니다.
    const temporary = cause && !cause.code && (cause.status === 429
      || (typeof cause.status === 'number' && cause.status >= 500 && cause.status <= 599)
      || (cause.status === 0 && /AbortError|TimeoutError/.test(`${cause.message} ${cause.details}`)));
    if (!temporary) throw error;
    // 저장된 최신 본문을 확인하지 못했으므로 이전 내장 글이나 부분 목록을 공개하지 않습니다.
    console.warn('분류 페이지의 관련 가이드 조회를 잠시 보류했습니다.');
    return { guides: [], unavailable: true };
  }
}
