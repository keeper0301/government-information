// ============================================================
// 텔레그램 봇 /help 텍스트 — 명령 목록 (200줄 룰 위해 분리).
// ============================================================
// dispatcher 변경 없이 새 명령 추가 시 여기 한 줄만 더하면 끝.

import { ALLOWED_TRIGGERS } from "./operate";

export function helpText(): string {
  return [
    "[keepioo 봇 명령]",
    "",
    "── 기본 ──",
    "/help · /test · /status",
    "/trigger {cron-name} — 수동 cron 실행",
    "",
    "── 어드민 원격 ──",
    "/queue — backlog 한 화면 (news·press·dedupe)",
    "/press — pending press 후보 5개",
    "/press low — LOW tier 만 (apply_url·신청법 표시, 모바일 검수 가속)",
    "/press confirm {uuid} — 자동 등록",
    "/press dismiss {uuid} — 후보 폐기",
    "/dedupe — pending 중복 후보 5개",
    "/dedupe confirm {baseId} — 중복 확정 (audit 기록)",
    "/dedupe reject {baseId} — 오탐 해제 (link 제거)",
    "/decide — 미결정 결정 목록 (임계 조정·spec 진입 등)",
    "/decide approve {id} — 승인 + 액션 실행",
    "/decide reject {id} — 무시",
    "/decide consult {id} — 상의 표시",
    "/news — 분류 대기 뉴스 5개",
    "/health — 사이트 헬스 요약",
    "/user {이메일|UUID} — 사용자 lookup",
    "/today — 24h KPI",
    "/stats [welfare|loan|all] — enrich 진행률",
    "/admin — 어드민 빠른 링크",
    "/selflearning — 자가 진화 학습 결과 즉시 (cron 안 기다리고)",
    "",
    "── 자동 등록 회수 ──",
    "/recent — 24h 자동 등록 5개 (revoke prefill)",
    "/revoke {uuid} — 자동 등록 정책 회수",
    "/restore {uuid} — 회수된 정책 복원",
    "",
    "── 사이트 조작 (Vercel) ──",
    "/env — 운영 toggle env 현재 값",
    "/env set {KEY} {값} — env 변경 (화이트리스트만)",
    "/redeploy — production 즉시 재배포",
    "",
    "── 콘텐츠 트리거 ──",
    "/publish blog [카테고리] — 블로그 즉시 발행",
    "/publish preview [카테고리] — 미리보기 (DB 저장 안 함)",
    "/publish indexnow — 색인 ping (네이버·Bing·Yandex)",
    "",
    "사용 가능 cron:",
    ...ALLOWED_TRIGGERS.map((t) => `  · ${t}`),
  ].join("\n");
}
