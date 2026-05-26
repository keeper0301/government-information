# 토스페이먼츠 빌링 카드사 심사 가이드 (2026-05-26)

> **작성일**: 2026-05-26
> **대상**: 사장님 직접 액션 (토스페이먼츠 콘솔 + 카드사 심사)
> **예상 소요**: 2분 (심사 통과 후 1 click 신고만)
> **우선순위**: 중간 — 빌링 정기결제 가동 대기

## 배경

토스페이먼츠 빌링(정기결제) 계약 카드사 심사가 진행 중입니다. 통과 전까지는 checkout 페이지의 "프로 7일 무료체험 시작 (카드 등록)" button 은 동작하나, 실제 토스 결제창은 심사 통과 후에만 활성화됩니다.

## PPT 검수 자료

이미 5/26 commit `0e0eac2` 으로 PPT 자동 생성 도구 보존:

| 파일 | 역할 |
|---|---|
| `tools/generate-toss-ppt.mjs` | Playwright 6 화면 캡처 + pptxgenjs PPT 빌드 |
| `tools/capture-toss-payment.mjs` | 6번 토스 결제창 단독 캡처 백업 (admin magic link) |
| `tools/confirm-toss-user.mjs` | 검수 계정 email 강제 confirm (service_role) |

재제출 또는 다른 PG 사 심사 시 재실행 가능. secret 은 모두 `.env.local` 에 있고 (`TOSS_REVIEW_*` 4 키), git history 평문 노출 0건.

## 재제출 절차

PC 에서 한 줄 (실행 시간 약 3분):

```bash
node tools/generate-toss-ppt.mjs
```

`tools/toss-payment-route.pptx` 결과물이 자동 생성됩니다 (PPT 자체는 `.gitignore`).

## 심사 통과 후 사장님 액션

심사 통과 알림 (토스 콘솔 또는 카드사 메일) 도착 시:

1. https://keepioo.com 로그인 (admin)
2. https://keepioo.com/api/admin/mark-toss-billing-approved 한 번 navigate
3. `{"ok":true,"message":"토스 빌링 심사 통과 신고. PendingExternalActionsCard 자동 hide."}` 응답 확인
4. /admin/autonomous 진입 시 토스 빌링 카드 자동 사라짐

멱등성 보장 — 여러 번 click 해도 audit row 만 누적, 동작 영향 0.

## 관련 자산

- 가맹점 정보: 키피오 / 657-24-02265 / MID `bill_keepi8lz6`
- 검수 계정: `.env.local` 의 `TOSS_REVIEW_EMAIL`
- 토스 콘솔: https://app.tosspayments.com
- 연동 가이드: https://docs.tosspayments.com/guides/billing/integration

## 사후 권고

심사 통과 후 검수용 password `TOSS_REVIEW_PASSWORD` 회전 권장 (Gmail `+` alias 라 사장님 본인 alias 로 reset 가능 — prod admin 권한과 격리 필요).
