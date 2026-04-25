// ============================================================
// /onboarding/topics — 구 라우트, /onboarding 으로 영구 이전
// ============================================================
// 2026-04-25 — 5단계 종합 온보딩 (/onboarding) 으로 통합되며 deprecate.
// 사장님 결정: 사용자 북마크·외부 링크 보존 위해 301 redirect 유지.
// topic-picker.tsx 는 dead code (이 page 에서 import 안 함).
// ============================================================

import { permanentRedirect } from "next/navigation";

export default function OnboardingTopicsPage() {
  permanentRedirect("/onboarding");
}
