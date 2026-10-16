# 발행 응답 유실 대조와 기존 글 복구

`publish-blog`는 GET이어도 새 글을 생성한다. HTTP 000, 5xx, 비정상 HTTP 200을 다시 호출하거나 전체 workflow를 재실행하지 않는다. 클라이언트 대기는 서버 `maxDuration=110`보다 긴 125초다. 결과 불명확 호출이 하나라도 있으면 workflow를 실패로 남긴다.

## 읽기 전용 대조

1. 인증된 Actions 로그에서 UTC 호출 구간, offset, attempt, 응답 slug/ID를 확보한다.
2. 같은 구간의 `admin_actions`에서 `action='blog_publish_run'`의 `details.offset`, `details.results`를 읽는다. 기록이 없다는 이유로 미생성을 단정하지 않는다. 함수가 종료되기 전 blog_posts INSERT가 끝났을 수 있다.
3. `blog_posts`와 `wordpress_publish_log`를 LEFT JOIN한다. slug가 있으면 정확한 slug로 식별하고, 응답 유실이면 호출 시간 구간의 후보를 먼저 찾는다. 시간만으로 호출과 일대일 대응을 단정하지 않는다.

```sql
select b.id, b.slug, b.title, b.created_at,
       w.status, w.wp_post_id, w.wp_post_url, w.error_message,
       w.failed_at, w.updated_at
from blog_posts b
left join wordpress_publish_log w on w.blog_post_id = b.id
where b.created_at between :utc_start and :utc_end
order by b.created_at;

select created_at, details
from admin_actions
where action = 'blog_publish_run'
  and created_at between :utc_start and :utc_end
order by created_at;
```

4. 공개 글 대조는 `lib/wordpress/reconcile-preview.ts`의 `findWordPressByBacklink(slug, wpApiUrl)`를 재사용한다. HTTPS 원본 백링크가 정확하고 status=publish인 단일 글만 긍정 증거다. known ID는 `scripts/verify_wordpress_public.py`의 ID/status/link 검증으로 읽는다. unavailable/검색 누락/여러 매칭은 재POST 근거가 아니다.
5. 타임아웃 일괄 대조는 `scripts/audit-wordpress-timeouts.ts` 또는 인증된 GET `/api/cron/wordpress-audit`를 재사용한다. 감사는 최근 48시간의 timeout만 읽는다. HTTP 500이나 모든 외부 호출을 감사하지 않으며 성공한 감사가 복구 완료를 뜻하지 않는다.

기존 글 재발행은 인증된 POST `/api/cron/wordpress-retry`에 `{ "blogPostId": "기존 UUID" }`를 보낸다. 이 경로는 durable log가 failed이고 wp_post_id가 없으며 오류가 정확히 `HTTP 401:`/`HTTP 403:`으로 시작하고 원본이 승인된 공개 글일 때만 허용한다. 실제 POST 전 claim의 원자적 비교·갱신도 통과해야 한다. 응답의 retryEligible은 참고 정보이며 권한이나 재발행 명령이 아니다.

## 2026-10-07 실행 37557055866

확인 기준 master: `50bdef030c388c6d877cbbf0ffc0f92e240a10cc`. 실행 당시 revision: `153f682`.

3번째(offset=2) 글은 `f1136b4f-1f07-4d05-b4dc-311f8716ed9b`, slug suffix `lsttx4k2`다. durable log는 **HTTP 500**, WordPress `wp_die`, `Error establishing a database connection`, wp_post_id=null이다. 인증 실패로 취급하거나 자동 재발행하지 않는다.

| 구간/증거 | 기존 blog_post_id | 상태 |
|---|---|---|
| offset=0 감사 기록, 디딤돌 대출 | 76d69210-a380-4ef8-8fac-e862e64a644e | WP timeout, 공개 조회 unavailable |
| offset=0 감사 기록, 수원 전세 이자 | 11decc29-a588-4f92-951a-b9ad5d4cf1aa | WP timeout, 공개 조회 unavailable |
| offset=1 호출 구간, 공주 출산장려금 | e44d205f-9d04-40d9-82f9-7d515dec6113 | WP timeout, 감사 완료 기록 없음 |
| offset=1 감사 기록, 체불 임금 대지급금 | 8bef3ab0-3004-4172-86db-466e1a894619 | WP timeout, 공개 조회 unavailable |
| offset=2, 울산 보험료 | f1136b4f-1f07-4d05-b4dc-311f8716ed9b | WP HTTP 500, 공개 조회 unavailable |
| offset=3 첫 시도, 기장 교복비 | 7fb6db4d-83a3-4aa5-a18b-a0234e297187 | durable log published, WP ID 18554 |

해당 호출 구간에서 DB 글 10개를 확인했다. Actions가 응답으로 확인한 keepioo 성공 5개 외에도 서버 작업이 진행됐다는 증거다. 현재 환경의 공개 REST 읽기는 timeout/unavailable이므로 미게시 또는 복구 완료를 주장하지 않는다. DB/WordPress 쓰기와 workflow 재실행은 수행하지 않았다.

## 회귀 확인

- `python3 -m unittest discover -s scripts/tests`: workflow shell을 가짜 curl로 실제 실행한다. 000/5xx/비정상 200 반복 금지, 401/403 한 번 재시도, 기존 ID·offset·WP HTTP 기록을 확인한다.
- Vitest: publisher HTTP 상태 보존, body 없는 결과 요약, 기존 ID 감사 기록, retry endpoint의 500/502/network 거절 및 401/403 허용.
