// ============================================================
// 카카오 알림톡 템플릿 정의
// ============================================================
// 카카오비즈니스 센터에 등록·심사 통과된 템플릿과 1:1 매칭.
// 템플릿 문안을 주석으로 보존해 코드·카카오 심사본 일치 여부를 추적 가능.
//
// 운영 흐름:
//   1) 아래 문안을 카카오비즈니스 파트너센터 (business.kakao.com/profiles) 에 등록
//   2) 카카오 심사 통과 (영업일 1~3일)
//   3) 대행사(솔라피) 콘솔에서 해당 템플릿의 고유 ID 발급 받음
//   4) Vercel 환경변수 `SOLAPI_TEMPLATE_ID_POLICY_NEW` 에 해당 ID 저장
//   5) `sendAlimtalk({ templateCode: 'POLICY_NEW', ... })` 호출로 발송
//
// 템플릿 수정이 필요하면:
//   - 카카오 정책상 승인된 템플릿은 수정 불가 → 새 템플릿 등록 후 재심사
//   - 환경변수의 ID 만 교체하면 코드 변경 없이 전환 가능
// ============================================================

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  📝 POLICY_NEW  —  카카오비즈니스 센터 등록용 원문
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  템플릿 명칭: 정책알리미_신규정책알림
//  메시지 유형: 기본형 (Basic)
//  분류:        정보성 (사용자가 알림 규칙을 능동 등록한 후 발송)
//  카테고리:    서비스이용 > 기타
//
//  ────── 본문 ──────
//  [keepioo] 새 맞춤 정책 알림
//
//  #{rule_name} 조건에 맞는 새 정책이 등록되었습니다.
//
//  ▸ 정책명: #{title}
//  ▸ 신청 마감: #{deadline}
//
//  자세한 지원 조건과 신청 방법은 아래에서 확인하실 수 있습니다.
//  ───────────────────
//
//  ────── 버튼 ──────
//  1) 웹링크 | 정책 자세히 보기 | URL: https://www.keepioo.com#{detail_path}
//  2) 웹링크 | 알림 설정 변경 | URL: https://www.keepioo.com/mypage/notifications
//  ───────────────────
//  · 버튼 URL 은 도메인(https://www.keepioo.com)을 템플릿에 고정하고
//    경로만 변수로 주입 — 카카오 심사가 "완전 동적 URL" 보다 "도메인 고정 + path 변수"
//    형태를 선호(피싱 방지). variables.detail_path 에는 `/welfare/{id}` 또는
//    `/loan/{id}` 형태의 절대경로(선행 `/` 포함)를 전달.
//
//  ────── 심사 주의사항 ──────
//  · 광고·홍보 문구 ✕ (할인·이벤트·혜택·무료 금지어 없음)
//  · 채널 친구 추가 유도 ✕
//  · 이모지 최소화 (▸ 기호만 사용)
//  · 수신 동의 명시 — 서비스 내 알림 규칙 등록 시 kakao_messaging 동의 필수
//    (정보통신망법 제50조 대응은 코드 레벨 3중 방어로 완료)
//  ────────────────────────────
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type KakaoTemplateCode = "POLICY_NEW";

// 템플릿별 변수 스키마 — 타입 안전성 (오타·누락 방지)
export type KakaoTemplateVariables = {
  POLICY_NEW: {
    /** 사용자가 등록한 알림 규칙 이름 (예: "청년 주거 지원") */
    rule_name: string;
    /** 정책 제목 */
    title: string;
    /** 신청 마감일 (ISO date 또는 "상시") */
    deadline: string;
    /**
     * keepioo 내부 상세 페이지 경로(`/welfare/{id}` 또는 `/loan/{id}`).
     * 선행 `/` 포함. 템플릿에 등록된 버튼 URL `https://www.keepioo.com#{detail_path}`
     * 와 조립되어 최종 절대 URL 생성. 심사 통과율을 위해 도메인 고정 + path 변수 채택.
     */
    detail_path: string;
  };
};

// Solapi 에 등록된 실제 템플릿 ID 로 매핑.
// 각 템플릿은 카카오 심사 통과 후 Solapi 콘솔에서 별도 ID 가 발급됨.
// 환경변수 미설정 = 해당 템플릿 미심사 상태 → sendAlimtalk 가 api_error 반환.
export function getSolapiTemplateId(code: KakaoTemplateCode): string | null {
  switch (code) {
    case "POLICY_NEW":
      return process.env.SOLAPI_TEMPLATE_ID_POLICY_NEW ?? null;
    default:
      return null;
  }
}
