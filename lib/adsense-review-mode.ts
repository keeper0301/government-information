import { searchReviewNoindexRobots } from "@/lib/search-review-mode";

// 애드센스 재심사 모드 스위치.
// 안전 기본값은 켜짐(true)입니다. 과거 승인 시도 때 남은 Vercel env
// "approved-after-review" 값만으로는 더 이상 OFF 처리하지 않습니다.
// 실제 Google AdSense 승인 후에만 아래 토큰으로 바꾸세요.
export const ADSENSE_LIVE_ADS_TOKEN = "adsense-approved-live-ads";
export const ADSENSE_REVIEW_MODE =
  process.env.NEXT_PUBLIC_ADSENSE_REVIEW_MODE !== ADSENSE_LIVE_ADS_TOKEN;

export function reviewModeNoindexRobots(options: { follow?: boolean } = {}) {
  // 기존 호출부 호환용입니다. 광고 승인 여부로 검색 제외를 해제하지 않습니다.
  return searchReviewNoindexRobots(options);
}
