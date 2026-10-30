// 대량 목록은 개별 검수 글과 다릅니다. 광고 승인만으로 일괄 검색 공개하지 않습니다.
export const SEARCH_REVIEW_MODE = true;

export function searchReviewNoindexRobots(options: { follow?: boolean } = {}) {
  return { index: false, follow: options.follow ?? true };
}
