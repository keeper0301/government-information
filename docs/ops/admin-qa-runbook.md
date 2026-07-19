# Admin QA / 운영 로그 점검 Runbook

관리자 화면 hydration·pageerror 재발을 빨리 확인하기 위한 짧은 절차입니다. 비밀값, storageState, 쿠키 내용은 출력하거나 커밋하지 않습니다.

## 1. 비로그인 관리자 redirect smoke

기본 smoke는 실제 프로덕션 `https://www.keepioo.com`을 열고 보호된 관리자 경로가 로그인으로 안전하게 이동하는지와 브라우저 `pageerror`/console error가 없는지 봅니다.

```bash
npm run smoke:admin-pageerrors
```

확인 대상:

- `/admin`
- `/admin/health`
- `/admin/users`
- `/admin/decisions`
- `/admin/autonomous`
- `/admin/system-ops`

정상 기준:

- 각 route의 `finalUrl`이 `/login?next=...`를 포함
- `pageErrors: []`
- `consoleErrors: []`
- 마지막 줄: `admin pageerror smoke passed (redirect)`

다른 배포 URL을 확인할 때:

```bash
ADMIN_SMOKE_BASE_URL="https://preview-or-prod-url" npm run smoke:admin-pageerrors
```

## 2. 로그인 관리자 smoke

실제 관리자 내부 화면을 볼 때만 사용합니다. CI에는 넣지 않습니다.

1. 사용자가 직접 브라우저에서 로그인합니다.
2. 로컬에서만 storageState 파일을 만듭니다.
3. 파일 내용은 절대 출력하지 않습니다.
4. 실행 후 바로 삭제합니다.

```bash
ADMIN_SMOKE_STORAGE_STATE="/absolute/path/admin.storageState.json" npm run smoke:admin-pageerrors
rm -f /absolute/path/admin.storageState.json
```

정상 기준:

- `mode: authenticated`
- 각 관리자 페이지 h1이 기대값으로 표시
- `pageErrors: []`
- `consoleErrors: []`

## 3. GitHub Actions 분리 smoke

workflow: `.github/workflows/admin-pageerror-smoke.yml`

트리거:

- 수동 실행: `workflow_dispatch`
- 정기 실행: KST 10:35 / 22:35

실패 시:

- GitHub Actions 실패가 남습니다.
- `CRON_SECRET`이 있으면 `/api/notify-telegram`으로 실패 로그 일부를 보냅니다.

## 4. Vercel 운영 로그 확인

최근 production 배포 상태:

```bash
npx vercel inspect https://www.keepioo.com --scope keeper0301-8938s-projects
```

최근 runtime log:

```bash
npx vercel logs https://www.keepioo.com --scope keeper0301-8938s-projects
```

정상 기준:

- production deployment `Ready`
- smoke 시간대 `/admin/*` → `/login` 요청은 info 수준
- error/fatal 로그 없음

## 5. Sentry 확인 루트

로컬 직접 조회는 아래 env가 있을 때만 가능합니다.

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

없으면 직접 API 조회를 건너뛰고 다음으로 대체합니다.

- `npm run smoke:admin-pageerrors`
- Vercel production logs
- 기존 `/api/cron/sentry-daily-summary` 실행 결과 또는 알림

Sentry env가 있을 때는 기존 helper를 사용합니다.

```bash
node -e "import('./lib/sentry/daily-summary.ts').then(async m => console.log(await m.fetchSentryDailySummary()))"
```

주의: 토큰, DSN, storageState, 쿠키 값은 로그나 문서에 남기지 않습니다.

## 6. 재발 시 판단

- `/admin*` redirect smoke에서 #418 발생: `/login?next=...` 또는 전역 layout/client component를 우선 확인
- 로그인 관리자 내부에서만 #418 발생: 해당 관리자 페이지의 시간/숫자/SVG/random/window 의존 렌더링 확인
- `/admin/health`에서 `Uncaught (in promise) undefined`: AdSense 또는 외부 스크립트 유입 여부 확인
