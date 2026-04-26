// ============================================================
// ReconsentBannerContainer — 재동의 배너 조건 판정 (서버 컴포넌트)
// ============================================================
// 루트 layout 에 들어간다. 로그인한 사용자 중 필수 동의가 누락되었거나
// 버전이 낮은 경우에만 실제 배너(<ReconsentBanner>) 를 렌더.
//
// 비로그인 / 신규 가입 후 동의 정상 기록된 사용자는 아무 것도 렌더 안 함 (null).
// 서버 쿼리 2번 (getUser + user_latest_consent view). 로그인 없으면 1번만.
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { needsReconsent } from "@/lib/consent";
import { ReconsentBanner } from "./reconsent-banner";

export async function ReconsentBannerContainer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 비로그인이면 배너 자체 없음
  if (!user) return null;

  // 필수 동의 상태 체크. 실패 시 조용히 null (배너가 안 뜨는 게 유저 입장에선 문제 없음).
  // try/catch 안에서 JSX 를 직접 return 하면 React 비동기 렌더 에러를 catch 못 함 →
  // ESLint react-hooks/error-boundaries 룰 위반. 결과만 변수에 담아 try/catch 밖에서 렌더.
  let result: Awaited<ReturnType<typeof needsReconsent>>;
  try {
    result = await needsReconsent(user.id);
  } catch {
    return null;
  }
  if (!result.needs) return null;
  return <ReconsentBanner missing={result.missing} />;
}
