# 사이트 상주 운영 서버

이 문서는 `keepioo` 사이트를 계속 확인하는 상주 운영 서버 설정 방법입니다.

## 역할

- 렌더(Render, 서버를 계속 켜두는 서비스)에서 항상 켜져 있습니다.
- 5분마다 실제 사이트 주요 페이지를 직접 열어 봅니다.
- 사이트 접속이 2회 연속 실패하면 텔레그램으로 알립니다.
- 같은 장애 알림은 30분 안에 반복 발송하지 않습니다.
- 사이트 내부의 `/api/cron/agent-resident-cycle`도 계속 호출해서 운영 진단 기록을 남깁니다.
- `AI_MANAGER_ENABLED=true`이면 OpenAI API (인공지능 호출 도구)를 호출해 사이트 상태를 해석하고 운영 조치안을 만듭니다.
- AI가 판단한 조치안이 `watch` 또는 `urgent`이면 텔레그램으로 보고합니다.
- 블로그 품질 검수, 블로그 SNS 발행, 블로그 발행 정지 시 백업 발행을 관리합니다.
- 사이트 개선 스캔, 실패 cron 재시도, 조용한 수집 실패 감지를 주기적으로 실행합니다.
- 검색 색인, 정책 링크 점검, 정책 AI 가이드, 뉴스 해설 백필을 주기적으로 실행합니다.
- `/health` 주소로 상주 서버 자체가 살아 있는지 확인할 수 있습니다.

## 필요한 환경변수

렌더 서비스에 아래 값을 넣어야 합니다.

- `SITE_BASE_URL`: 실제 사이트 주소입니다. 기본값은 `https://www.keepioo.com`입니다.
- `AGENT_RESIDENT_INTERVAL_MS`: 반복 간격입니다. 기본값은 `300000`이고, 5분을 뜻합니다.
- `CRON_SECRET`: 사이트의 cron (예약 실행) 비밀값과 같아야 합니다.
- `TELEGRAM_BOT_TOKEN`: 텔레그램 봇 토큰입니다.
- `TELEGRAM_OWNER_CHAT_IDS`: 알림을 받을 텔레그램 채팅 아이디입니다. 여러 개면 쉼표로 구분합니다.
- `AI_MANAGER_ENABLED`: AI 상주 판단을 켤지 정합니다. 실제 사용하려면 `true`로 바꿉니다.
- `OUTER_AUTH_TOKEN`: 아우터(외부 인증 게이트웨이) 토큰입니다.
- `OUTER_BASE_URL`: 아우터 주소입니다. OpenAI 호환 `/responses` 주소를 제공해야 합니다.
- `OUTER_MODEL`: 아우터가 사용할 모델 이름입니다. 기본값은 `gpt-5.2`입니다.
- `AI_MANAGER_PERMISSION_LEVEL`: 자동화 권한 범위입니다. `observe`, `expanded`, `full_safe` 중 하나입니다. 기본 배포값은 `full_safe`입니다.
- `AI_MANAGER_INTERVAL_MS`: AI 판단 반복 간격입니다. 기본값은 `1800000`이고, 30분을 뜻합니다.
- `BLOG_MANAGER_ENABLED`: 블로그 발행 관리를 켤지 정합니다.
- `BLOG_MANAGER_ALLOW_BACKUP_PUBLISH`: 발행 정지 신호가 있을 때 백업 발행을 허용할지 정합니다.
- `BLOG_MANAGER_INTERVAL_MS`: 블로그 관리 반복 간격입니다.
- `BLOG_MANAGER_BACKUP_PUBLISH_GAP_MS`: 백업 발행 최소 간격입니다.
- `SITE_MAINTENANCE_MANAGER_ENABLED`: 사이트 개선·버그 감지 관리를 켤지 정합니다.
- `SITE_MAINTENANCE_MANAGER_INTERVAL_MS`: 사이트 개선·버그 감지 반복 간격입니다.
- `SITE_UPGRADE_MANAGER_ENABLED`: 사이트 품질 업그레이드 관리를 켤지 정합니다.
- `SITE_UPGRADE_MANAGER_INTERVAL_MS`: 사이트 품질 업그레이드 반복 간격입니다.

## 렌더 설정

`render.yaml`에 `keepioo-agent-resident` 서비스가 등록되어 있습니다.

1. 렌더에서 이 저장소를 Blueprint (설정 파일 기반 배포)로 연결합니다.
2. `keepioo-agent-resident` 서비스를 만듭니다.
3. 위 환경변수를 렌더 서비스에 추가합니다.
4. 서비스가 켜진 뒤 `/health`가 `200`으로 응답하는지 확인합니다.
5. 본 사이트의 Vercel 환경변수에 `KEEPIO_AGENT_HEALTH_URL`을 추가합니다. 값은 렌더 서비스 주소 뒤에 `/health`를 붙인 주소입니다.

## 로컬 확인

설정값만 확인하려면 아래 명령을 실행합니다.

```bash
npm run agent:resident:check
```

직접 실행하려면 아래 명령을 실행합니다.

```bash
npm run agent:resident
```

## 한계

제가 대화 밖에서 직접 살아 있는 것은 아닙니다. 대신 이 상주 서버가 계속 켜져서 사이트를 확인하고, OpenAI API로 운영 판단을 만들고, 장애를 알리고, 운영 진단을 호출합니다. 실제 24시간 관리는 이 서버와 렌더, 텔레그램 알림이 맡습니다.

AI 상주 판단은 삭제, 결제, 권한, 비밀값, 데이터베이스 파괴 작업을 자동 실행하지 않습니다. 이런 작업은 알림과 검토 대상으로만 남깁니다.

권한 단계는 아래처럼 나뉩니다.

- `observe`: 사이트 확인, 운영 진단 기록, 관리자 알림만 합니다.
- `expanded`: 안전한 cron 재시도 제안, IndexNow 제출 제안, 블로그 품질 점검, 외부 콘솔 이상 감지를 포함합니다.
- `full_safe`: 등록된 저위험 dispatcher 자동 실행, 검증된 비파괴 백필 제안, 스크래퍼 수정 PR 생성 제안까지 허용합니다.

## 자동 관리 범위

블로그 관리는 아래 작업을 자동으로 실행합니다.

- `/api/cron/blog-quality-check`: 새 글 품질 검수와 외부 발행 게이트 해제
- `/api/cron/sns-publish-blog`: 품질 통과 글의 SNS 발행
- `/api/publish-blog?count=1`: 블로그 발행 정지 신호가 있을 때만 백업 발행 1건

사이트 개선·버그 감지는 아래 작업을 자동으로 실행합니다.

- `/api/cron/autonomous-improvement-scan`: 운영 데이터 기반 개선 후보 생성
- `/api/cron/failed-cron-retry`: 실패한 안전 cron 자동 재시도
- `/api/cron/silent-fail-detect`: 수집기가 조용히 실패하는지 감지

사이트 품질 업그레이드는 아래 작업을 자동으로 실행합니다.

- `/api/indexnow-submit-recent`: 최근 글 검색 색인 제출
- `/api/cron/policy-url-check`: 정책 신청 링크 점검
- `/api/cron/policy-ai-guide-backfill`: 정책 AI 가이드 보강
- `/api/cron/news-ai-commentary-backfill`: 뉴스 해설 보강

AI 상주 판단은 OpenAI 직접 주소를 기본값으로 쓰지 않습니다. `OPENAI_API_KEY`, `OPENAI_AUTH_TOKEN`, `OPENAI_BASE_URL`도 읽지 않습니다. 반드시 아우터가 필요합니다. 아우터가 OpenAI 호환 `/responses` 주소를 제공하면 `OUTER_BASE_URL`에 아우터 주소를 넣고, `OUTER_AUTH_TOKEN`에 아우터 토큰을 넣습니다.
