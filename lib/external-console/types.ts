// ============================================================
// 외부 console 자동 점검 — 공통 타입 (Phase 3 자율 운영)
// ============================================================
// 매일 KST 09:30 cron 이 외부 시스템 (사이트·AdSense·카카오·토스·GA4) 점검 →
// 이상 발견 시 사장님 SMS. 정상이면 SMS 안 보냄 (noise 0).
//
// 각 console checker 는 ConsoleCheckResult 반환. 통합 cron 이 모두 모아서
// alerts 가 1건 이상이면 SMS 발송. KPI 는 이메일·admin 페이지에서 활용.
// ============================================================

export interface ConsoleAlert {
  // 이상 종류 — alert 그룹화 + admin 페이지 라벨링용
  key: string;
  // SMS 본문에 들어갈 한 줄 요약
  message: string;
  // 사장님 즉시 액션 1줄 (선택, Phase 1 health-alert 와 동일 패턴)
  recommendation?: string;
}

export interface ConsoleCheckResult {
  // 콘솔 식별자 — site/adsense/kakao/toss/ga4 등
  console: string;
  // 이상 신호 — 1건 이상이면 SMS 대상
  alerts: ConsoleAlert[];
  // 정상 KPI — 추가 컨텍스트 (이메일·admin·디버그용)
  kpis: Record<string, unknown>;
  // 점검 자체 실패 (네트워크·인증 만료 등) — 별도 alert 으로 처리
  error?: string;
}
