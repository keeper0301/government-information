# 에이전트 상시 운영 서버

이 문서는 keepioo 사이트를 계속 순찰하는 상시 운영 워커 설명입니다.

## 하는 일

- Vercel 서버리스(요청이 올 때만 잠깐 켜지는 서버)의 시간 제한 밖에서 계속 실행됩니다.
- 5분마다 `https://www.keepioo.com/api/cron/agent-resident-cycle`을 호출합니다.
- `/health` 주소를 열어 `/admin/autonomous`와 Render 상태 확인이 워커 생존 여부를 확인하게 합니다.
- 사이트 안의 `agent-policy.ts` 정책 엔진을 사용하므로, 모든 행동은 분류되고 감사 로그에 남습니다.

## 필요한 환경변수

- `CRON_SECRET`: 운영 사이트와 같은 cron 비밀값입니다.
- `SITE_BASE_URL`: 기본값은 `https://www.keepioo.com`입니다.
- `AGENT_RESIDENT_INTERVAL_MS`: 실행 간격입니다. 기본값은 `300000`밀리초, 즉 5분입니다.

로컬에서는 `.env.local`을 자동으로 읽습니다. 그래서 아래 명령만으로 확인할 수 있습니다.

```bash
npm run agent:resident:check
```

## Render 설정

`render.yaml`을 사용합니다.

1. 이 저장소로 새 Render Blueprint를 만듭니다.
2. `keepioo-agent-resident` 서비스를 선택합니다.
3. `CRON_SECRET`을 비밀 환경변수로 추가합니다.
4. 항상 켜진 상태가 필요하므로 Starter 이상 요금제를 사용합니다.
5. `/health`가 `ready: true`를 돌려주는지 확인합니다.
6. 본 사이트의 Vercel 환경변수에 `KEEPIO_AGENT_HEALTH_URL`을 추가합니다. 값은 Render가 제공한 공개 주소 뒤에 `/health`를 붙인 주소입니다.

## 로컬 실행

```bash
npm run agent:resident
```

설정만 확인하려면 아래 명령을 사용합니다.

```bash
npm run agent:resident:check
```

## 안전장치

이 워커는 사이트 정책 엔진을 우회하지 않습니다. 운영 데이터베이스 변경은 파괴적이지 않고, 마이그레이션 테스트와 되돌리기 준비가 모두 확인된 경우에만 허용됩니다. 삭제성 데이터베이스 작업, 인증·권한 변경, 비밀값, 결제, 강제 실행은 차단되거나 사장님 검토로 넘어갑니다.
