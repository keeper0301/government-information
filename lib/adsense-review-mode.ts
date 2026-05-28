// 애드센스 재심사 모드 스위치.
// 기본값은 켜짐(true)입니다. 승인 후 Vercel 환경변수에서
// NEXT_PUBLIC_ADSENSE_REVIEW_MODE=off 로 바꾸고 다시 배포하면
// 홈·메뉴·검색·사이트맵·RSS가 뉴스 포함 구조로 돌아갑니다.
export const ADSENSE_REVIEW_MODE =
  process.env.NEXT_PUBLIC_ADSENSE_REVIEW_MODE !== "off";
