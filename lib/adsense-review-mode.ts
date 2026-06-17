// 애드센스 재심사 모드 스위치.
// 안전 기본값은 켜짐(true)입니다. 기존 Vercel env 의 "off" 값이 남아 있으면
// 재심사 중 대량 자동 페이지가 다시 노출될 수 있어 더 이상 off 로 끄지 않습니다.
// 승인 후에만 NEXT_PUBLIC_ADSENSE_REVIEW_MODE=approved-after-review 로 바꾸세요.
export const ADSENSE_REVIEW_MODE =
  process.env.NEXT_PUBLIC_ADSENSE_REVIEW_MODE !== "approved-after-review";
