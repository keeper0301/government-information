# 외부 자동 글쓰기 — 24시간 자동 가동 설계

작성일: 2026-05-07
사전 작업: hot-fix 3건 (commit `242406e`) — 워드프레스 timeout / IndexNow Host 헤더 / 워드프레스 카테고리·태그 ID 매핑

## 1. 배경

사장님 요청: **"네이버 환경변수 저장해 외부 자동 글쓰기 쓸 수 있도록 방법을 마련해. 내 컴퓨터가 꺼져 있어도 작동되게 하고 싶어."**

기존 인프라 점검 결과:
- `lib/indexnow.ts`·`/api/indexnow-submit-recent` cron — 네이버 SearchAdvisor 색인 자동 ping 인프라 **이미 100% 구축**. `INDEXNOW_KEY` 환경변수 가동 여부만 점검 필요.
- `lib/wordpress/publisher.ts`·`/admin/wordpress`·`migrations/072` — 워드프레스 자동 발행 인프라 **이미 100% 구축**. 사장님이 워드프레스 사이트 보유 + 환경변수 등록만 점검 필요.
- `lib/naver-blog/queue.ts`·`/admin/naver-blog`·`migrations/071` — 네이버 블로그 발행 큐 인프라 구축됨. 단 **네이버는 공식 글쓰기 API 폐지 + 헤드리스 봇 자동화 시 캡차·기기 인증·계정 정지 위험** 으로 24시간 무인 자동화 불가능. 차선책: 큐에 쌓이고 → 텔레그램 알림 → 사장님 PC 켤 때 클로드한테 부탁해서 5분 안에 일괄 발행.

## 2. 목표

1. **네이버 검색 색인 자동 등록 (B)**: keepioo.com 새 글이 사장님 PC 상태와 무관하게 매일 네이버 검색에 자동 등록.
2. **워드프레스 자동 발행 (C-2)**: keepioo 본 블로그 발행 시 사장님 워드프레스 사이트에도 동시 발행되어 백링크·도메인 권위 24h 자동 확보.
3. **네이버 블로그 큐 알림 (C-1)**: 큐가 일정량 쌓이면 사장님 텔레그램으로 알림 + `/admin/naver-blog` 일괄 발행 흐름 강화 (사장님 PC 켤 때 5분 처리).

### 비목표 (Out of Scope)

- 네이버 블로그 헤드리스 봇 자동 발행 — 캡차·약관 위반 위험.
- 티스토리·다음·구글 블로거 자동 발행 — 워드프레스로 백링크 효과 충분.
- 네이버 카페 자동 글쓰기 — 글쓰기 API 부재 + 약관 위험.
- 워드프레스 사이트 신규 셋업 — 사장님 이미 보유 (`keepioopolicy.wordpress.com` 추정).

## 3. 설계

### 3.1 데이터 흐름 (변경 없음 + 활성화)

```
keepioo 새 블로그 INSERT (lib/blog-publish.ts)
  │
  ├─→ blog_posts 저장
  ├─→ enqueueNaverBlog (큐 추가) ──── Phase 3: 큐 N건 ↑ 시 텔레그램 알림
  ├─→ publishToWordPress (REST POST) ── Phase 2: 환경변수 가동 시 즉시 발행
  │
  └─→ (24h 후) /api/indexnow-submit-recent cron
         └─→ submitToIndexNow ─── Phase 1: 네이버 SearchAdvisor 자동 색인
```

### 3.2 Phase 1 — 네이버 자동 색인 점검·가동 확인

**목표**: `INDEXNOW_KEY` Vercel env 살아있는지 + 어제 cron 정상 ping 확인. 없으면 신규 발급·등록.

**작업**:
1. Vercel env 에 `INDEXNOW_KEY` 존재 여부 확인 (Vercel CLI `vercel env ls` 또는 dashboard).
2. 미설정이면 32~64자 hex 문자열 신규 발급 (`crypto.randomBytes(32).toString("hex")`) → Vercel env 등록 → redeploy.
3. `https://www.keepioo.com/api/indexnow-key` GET → 200 응답 + 본문이 KEY 문자열인지 확인.
4. 어제 cron 결과 검증 — Vercel logs `/api/indexnow-submit-recent` `searchadvisor.naver.com` 응답 200/202 확인.
5. (선택) 네이버 SearchAdvisor 사이트 등록 상태 확인 — `https://searchadvisor.naver.com` 에 keepioo.com 등록되어 있어야 함.

**검증**: 사장님이 새 글 발행 → 24h 후 `site:keepioo.com` 네이버 검색에서 신규 글 노출.

**위험·롤백**: env 등록·재설정만이라 redeploy 한 번이면 즉시 회복.

### 3.3 Phase 2 — 워드프레스 자동 발행 가동

**목표**: `WP_API_URL`·`WP_USERNAME`·`WP_APP_PASSWORD` env 살아있는지 점검 + 다음 발행에서 워드프레스 자동 등록 확인.

**작업**:
1. Vercel env 3개 존재 여부 확인.
2. 누락 시 사장님께 안내:
   - `WP_API_URL` = `https://{사장님-사이트}.wordpress.com/wp-json/wp/v2` (또는 self-hosted 도메인 + `/wp-json/wp/v2`)
   - `WP_USERNAME` = wordpress.com 사용자명
   - `WP_APP_PASSWORD` = `https://wordpress.com/me/security/two-step` → Application Passwords 24자리
3. 등록 후 `/admin/wordpress` 접속 → 환경변수 미설정 배너 사라졌는지 확인.
4. `lib/blog-publish.ts:410` 에서 `publishToWordPress` 호출 경로가 살아있음 — 다음 cron (`KST 06:00 GitHub Actions blog-publish`) 자동 가동.
5. 발행 결과 — `/admin/wordpress` 통계 카드 "24h 발행" 1+ 표시 + 워드프레스 글 URL 클릭 가능.

**검증**:
- 사장님이 `keepioopolicy.wordpress.com/wp-admin/posts.php` 에서 새 글 확인.
- 글에 카테고리·태그가 keepioo 와 일치 (Phase 0 hot-fix 효과 검증).
- 글 본문 끝에 keepioo 백링크 footer 노출.

**위험·롤백**: 환경변수만 변경. publishToWordPress 가 graceful skip 되니 잘못 등록해도 keepioo 본 발행은 영향 0. env 빼면 즉시 비활성.

### 3.4 Phase 3 — 네이버 블로그 큐 알림 + 일괄 발행 강화

**목표**: 큐가 5건 이상 쌓이면 사장님 텔레그램으로 알림. `/admin/naver-blog` 에 "일괄 자동 발행 트리거" 버튼.

**작업**:
1. **큐 알림 cron** (`/api/cron/naver-queue-alert`):
   - 매일 KST 09:00 (UTC `0 0 * * *`).
   - `listPendingNaverQueue(50)` 결과 ≥ 5 일 때만 텔레그램 발송.
   - 메시지: "네이버 블로그 큐 N건 대기 중. PC 켤 때 클로드한테 'naver-blog 큐 N건 발행해줘' 라고 말씀하시면 5분 안에 정리됩니다. → keepioo.com/admin/naver-blog"
   - 환경변수 재사용: `TELEGRAM_BOT_TOKEN`·`TELEGRAM_OWNER_CHAT_ID` (이미 keepioo 텔레그램 인프라 가동 중이면 그대로 사용).
   - 텔레그램 인프라 미가동이면 SMS fallback (`sendOpsAlertSms` 재사용).

2. **`/admin/naver-blog` 일괄 발행 가이드 강화**:
   - 카드 상단에 "전체 일괄 자동 발행 (클로드 호출용 명령 복사)" 버튼.
   - 클릭 시 `naver-blog 큐 [id1, id2, ...] 자동 발행해줘` 같은 prompt 가 클립보드에 복사.
   - 사장님이 이걸 클로드 채팅창에 붙여 넣으면 클로드가 사장님 Chrome 으로 N건 일괄 자동 입력.
   - 환경변수 추가 0 — Chrome 의 기존 네이버 로그인 세션 재사용.

3. **vercel.json** 에 cron 1줄 추가.

**검증**:
- 큐 5건 이상 인위적 적재 후 cron 수동 트리거 → 사장님 텔레그램 알림 도착.
- "일괄 발행 트리거" 버튼 클릭 → 클립보드 복사 확인.
- 클로드한테 prompt 붙여 넣고 채팅 → 사장님 Chrome 에서 글 5건 자동 입력 흐름 확인 (마지막 "발행" 버튼은 사장님 직접 클릭 — 외부 게시 명시 승인 가드 유지).

**위험·롤백**: 신규 cron + UI 버튼만. 기존 큐·발행 흐름 영향 0. cron 비활성은 vercel.json 1줄 제거.

## 4. 구현 단계 (commit 단위)

| Phase | 작업 | 추정 시간 | 위험 | commit 단위 |
|---|---|---|---|---|
| 1 | INDEXNOW_KEY 점검 + 가동 확인 | 5~15분 | 0 | (코드 변경 0, env·운영 메모만) |
| 2 | WP_API_URL/USERNAME/APP_PASSWORD 점검 + 가동 확인 | 15~30분 | 0 | (코드 변경 0) |
| 3 | naver-queue-alert cron + UI 트리거 버튼 | 60~90분 | 低 | feat(naver-blog): 큐 텔레그램 알림 + 일괄 발행 트리거 |

## 5. 환경변수 요약

| 변수 | 위치 | 용도 | 본 spec 영향 |
|---|---|---|---|
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | Vercel | 네이버 뉴스 검색 API (기존) | 변경 없음 |
| `INDEXNOW_KEY` | Vercel | 네이버 SearchAdvisor IndexNow 키 | Phase 1 점검 |
| `WP_API_URL` / `WP_USERNAME` / `WP_APP_PASSWORD` | Vercel | 워드프레스 REST API 인증 | Phase 2 점검 |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_OWNER_CHAT_ID` | Vercel | 사장님 큐 알림 (재사용) | Phase 3 사용 |
| `CRON_SECRET` | Vercel | cron 인증 (기존) | Phase 3 cron 도 사용 |

## 6. 측정 지표

- Phase 1: `/admin/health` 또는 Vercel logs 의 cron 성공률 100%.
- Phase 2: `/admin/wordpress` 의 `published24h` 가 매일 1+ 표시.
- Phase 3: 큐 ≥ 5 일 때 텔레그램 알림 도착률 100% (테스트 1회 + 실제 5건 도달 시).

## 7. 후속 (이번 spec 범위 외)

- 워드프레스 발행 실패 자동 재시도 cron (`migrations/072` failed 행 대상).
- 네이버 블로그 큐 일괄 발행을 Playwright + claude-in-chrome MCP 매크로 단일 호출로 묶기.
- 광고 차단·SEO 효과 측정 (네이버 검색 클릭률 / 워드프레스 백링크 추적).

## 8. 결정·트레이드오프 메모

- **네이버 블로그 24h 무인 자동화는 불가능**이라는 점은 사장님과 명시적으로 확인 (질문 3·4 단계).
  - 차선책 (C-1) 으로 사장님이 "PC 켤 때 5분"의 운영 부담을 받아들임.
- **워드프레스 카테고리·태그 정수 ID 매핑**은 hot-fix 단계에서 먼저 적용 (`lib/wordpress/terms.ts`).
- **공통 환경변수 사고**: 환경변수 등록 시 Vercel **Production / Preview / Development** 셋 모두 등록 권장 (Phase 1·2 가이드에 포함).
