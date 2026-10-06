// 운영 경고와 review mode OFF 가드가 동일한 임계치를 사용한다.
const configuredNewsRatioFloor = Number(process.env.NEWS_RATIO_HIGH_FLOOR ?? "0.6");
export const NEWS_RATIO_HIGH_FLOOR =
  Number.isFinite(configuredNewsRatioFloor) && configuredNewsRatioFloor > 0 && configuredNewsRatioFloor <= 1
    ? configuredNewsRatioFloor
    : 0.6;

// 백필 완료는 콘텐츠 구성 점검을 대체하지 않으며 AdSense 승인을 의미하지 않는다.
export function isAdsenseContentReady(commentaryBackfillRatio: number, newsRatio: number): boolean {
  return commentaryBackfillRatio >= 0.8 && newsRatio >= 0 && newsRatio < NEWS_RATIO_HIGH_FLOOR;
}
