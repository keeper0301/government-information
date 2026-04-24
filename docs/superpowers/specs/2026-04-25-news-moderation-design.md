# 정책 뉴스 콘텐츠 모더레이션 v1 (저작권 hot-fix 도구)

> **한 줄 요약**: korea.kr RSS 수집 뉴스 중 법적·저작권 요청이 들어온 단건을 admin 이 1~2 클릭으로 전체 사이트에서 비공개 전환할 수 있는 도구.

## 배경·목적

keepioo 는 korea.kr RSS 3개 피드를 매일 KST 11:00 cron 으로 수집해 `news_posts` 테이블에 저장하고, `/news` 목록·홈 "최근 정책 소식" 3건·관련 공고 매칭 (뉴스↔공고) 에 노출한다. 공공누리 제1유형 라이선스라 재배포는 합법이지만, 실무상 **법적 요청·명예훼손 우려·오보** 발견 시 **즉시** 해당 단일 뉴스를 전체 사이트에서 끌 수 있는 도구가 필요하다. 현재는 Supabase 대시보드에 들어가 직접 UPDATE SQL 을 쳐야 하는 상태라 대응 속도·실수 위험 모두 나쁨.

이번 작업의 본질: **"url 하나 받으면 1~2 클릭으로 전체 사이트에서 비공개"**.

### 주 사용 시나리오 (월 1~5건 예상)
- 법적 요청: 외부에서 `https://keepioo.com/news/xxx 내려달라` 이메일·전화 수신 → 사장님이 URL 을 브라우저에 붙여넣음 → 페이지에 뜬 admin 전용 버튼 한 번 클릭 → 전체 차단.
- 오보·부정확한 내용 발견 (보조): 동일 흐름.

### 주 사용 시나리오가 **아닌** 것 (범위 밖 — 별도 spec)
- 키피오 무관 뉴스의 대량 큐레이션 (키워드 필터·카테고리 탭으로 이미 처리 중, 자연 도태).
- hard delete (DB 행 자체 삭제). `source_id` tombstone 필요, 재수집 복원 방지 로직 까다로움.

---

## 1. 데이터 모델

### 1.1 `news_posts` 컬럼 추가 4개
| 컬럼 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `is_hidden` | `BOOLEAN` | `false` | 메인 숨김 플래그. 이 하나가 모든 노출 제어의 SoT. |
| `hidden_at` | `TIMESTAMPTZ` | `NULL` | 숨긴 시각 (감사·정렬용). |
| `hidden_by` | `UUID` | `NULL` | 숨긴 admin 의 `auth.users.id`. |
| `hidden_reason` | `TEXT` | `NULL` | 사유. 포맷: `"{category}: {note}"` — 예: `"저작권: 홍길동 요청 2026-04-25"`. |

### 1.2 마이그레이션
- 파일: `supabase/migrations/028_news_is_hidden.sql`
- 최신 번호 027 다음.
- 인덱스: `CREATE INDEX idx_news_posts_visible ON news_posts (published_at DESC) WHERE is_hidden = false;` — partial index 로 공개 목록 쿼리 성능 유지. 전체 레코드 대부분이 `false` 라 효율 좋음.

### 1.3 RLS 정책 교체 (핵심)
기존 anon SELECT 정책을 **`is_hidden = false` 조건부** 로 교체. 이 한 줄이 `/news` 목록·홈·sitemap·관련공고 매칭·키워드 페이지 등 **모든 공개 쿼리에 자동 적용** — 코드 수정 없이 누락 위험 0.

```sql
DROP POLICY IF EXISTS news_posts_public_read ON news_posts;
CREATE POLICY news_posts_public_read ON news_posts
  FOR SELECT TO anon, authenticated
  USING (is_hidden = false);
```

admin 운영 UI 는 `createAdminClient()` (service role) 로 RLS 우회 — hidden 포함 전체 조회 가능.

### 1.4 수집 upsert 보호 (중요)
cron 수집은 `source_id` 기준 upsert. hidden 된 뉴스가 다음 수집에서 덮어써지면 안 됨.

**대응**: 수집 스크립트의 upsert 에서 `is_hidden` 컬럼은 `ON CONFLICT ... DO UPDATE SET ... WHERE news_posts.is_hidden = false` 로 기존 hidden 상태 보존. 또는 `is_hidden` 을 upsert 대상 컬럼에서 제외하고 신규 INSERT 시에만 `false` 초기화.

---

## 2. 운영 UI

### 2.1 통로 A — `/news/[slug]` 페이지의 admin 전용 버튼

**노출 조건**: 로그인 사용자 이메일이 `isAdminUser(email)` 통과 시에만 렌더.

**UI**: 상세 페이지 우상단에 작은 빨간색 `이 뉴스 숨김` 버튼. 클릭 시 modal:
- 사유 dropdown: `저작권` / `오보·오해소지` / `기타` (3종 고정)
- 메모 한 줄 텍스트 입력 (optional, 법적 요청자 이름·일시 기록 권장)
- `숨김` (primary) / `취소` (secondary) 버튼

**확정 시 동작**: server action `hideNews({ slug, reasonCategory, note })` → DB UPDATE + 감사 로그 + 관련 경로 revalidate → 페이지 reload.

### 2.2 통로 B — `/admin/news` 검색 + 토글

기존 `/admin/news` (통계·수동 수집) 페이지에 아래 두 블록 추가.

#### 2.2.1 뉴스 검색
- 단일 input: 제목 키워드·slug·source_id 중 하나 입력.
- 쿼리: `title ILIKE '%q%' OR slug = q OR source_id = q` (단순 OR, SQL injection 은 parameterized query 로 차단).
- 결과: 최대 50건, `published_at DESC`. 각 카드에 제목·부처·카테고리·발행일·현재 상태 배지 (`공개` / `숨김`) + 액션 버튼 (`숨김` 또는 `복원`).

#### 2.2.2 "최근 숨긴 뉴스 10건" 블록
- `is_hidden = true`, `hidden_at DESC`, LIMIT 10.
- 각 행: 제목·숨긴 시각·숨긴 사유 (1줄 truncate)·`복원` 버튼.
- 용도: 실수로 숨긴 경우 빠른 복구 fast path.

### 2.3 감사 로그 (기존 패턴 재사용)
- `admin_actions` 테이블 + `lib/admin-actions.ts` 의 `logAdminAction` 재사용.
- 새 action 문자열: `news_hide`, `news_unhide`.
- details JSON: `{ slug, news_id, reasonCategory, note }`.

---

## 3. 사용자 화면 영향

### 3.1 자동 제외 (RLS 덕분에 코드 변경 0)
다음 경로 모두 별도 코드 수정 없이 hidden 자동 제외:
- `/news` 목록 페이지
- `/news/keyword/[keyword]` 키워드 long-tail SEO 페이지
- `/` 홈 "최근 정책 소식" 3건 섹션
- `app/sitemap.ts` 의 news_posts 엔트리
- `lib/news-matching.ts` 관련 공고 매칭 (뉴스 상세→공고, 공고 상세→뉴스 양방향)

### 3.2 `/news/[slug]` 직접 접근 시
- anon 클라이언트로 조회 시 RLS 로 결과 없음 → Next.js 에서 "not found" 경로 진입.
- **응답 HTTP status: 410 Gone** (404 대신 — 영구 삭제 시그널이라 구글·네이버 인덱스에서 더 빨리 빠짐).
- 페이지 본문:
  - 제목: `이 뉴스는 현재 비공개 상태입니다`
  - 안내: `운영 정책상 비공개된 정책 소식입니다. 다른 최신 정책 소식을 보려면 아래 버튼을 눌러 주세요.`
  - CTA 버튼: `→ 정책 소식 목록 보기` (`/news` 링크)
- `<meta name="robots" content="noindex, nofollow">` → 재크롤 시 인덱스에서 제거.

### 3.3 admin 본인은 hidden 페이지도 접근 가능
- admin 로그인 상태면 `createAdminClient()` 로 RLS 우회 조회 후 페이지 렌더 (복원 검토용).
- 페이지 최상단에 노란 배너:
  `⚠ 이 뉴스는 현재 비공개 상태입니다. 일반 사용자에게는 410 Gone 페이지가 표시됩니다.`
  + `복원` / `사유 수정` 버튼.

---

## 4. 수용 기준 (Acceptance Criteria)

구현 완료 판단 기준. 하나라도 안 맞으면 미완.

1. admin 이 `/news/xxx` 방문 → `이 뉴스 숨김` 버튼 클릭 → 사유 선택 → 확인 → **10초 내** 동일 URL 을 시크릿 창 (비로그인) 으로 열면 410 Gone 페이지가 뜬다.
2. 숨긴 뉴스가 `/news` 목록·홈·sitemap·관련 공고 카드 모두에서 즉시 사라진다 (revalidate 반영 후).
3. `/admin/news` 검색창에 숨긴 뉴스 slug 입력 → 결과에 표시되고 `복원` 버튼이 뜬다 (비admin 에게는 결과 0).
4. `복원` 토글 클릭 → `is_hidden=false` 로 전환 → 공개 경로 모두 재노출.
5. 각 숨김·복원 동작이 `admin_actions` 에 감사 로그로 기록된다 (slug·reasonCategory·note·actorId·timestamp).
6. 비로그인·비admin 사용자에게는 `이 뉴스 숨김` 버튼 자체가 DOM 에 없다. server action 도 `isAdminUser` 체크로 거부한다 (이중 방어).
7. `/news/[hidden-slug]` 에 `curl -I` 치면 HTTP status 가 `410` 이다.
8. `/news/[hidden-slug]` HTML 에 `<meta name="robots" content="noindex, nofollow">` 가 포함된다.
9. cron 수집이 돌아도 hidden 상태가 유지된다 (upsert 가 `is_hidden` 을 건드리지 않는다).

---

## 5. 범위 밖 (의도적)

| 미포함 항목 | 이유 |
|---|---|
| Hard delete (DB 행 자체 삭제) | `source_id` tombstone 으로 재수집 방지 처리가 따로 필요. 현재 법적 요청 상황에서 soft hide + 410 Gone 이면 실무상 충분. |
| 일괄 hide / 체크박스 UI | 큐레이션·오보 대량 처리 시나리오 전용. 이번은 단건 hot-fix 에 최적화. |
| 사유별 통계 대시보드 | 데이터 쌓인 뒤 후속. ("저작권 요청 N건 / 오보 N건" 같은 리포트) |
| 자동 unhide / 만료 | 사유 해결 후 자동 복원. 수동만. |
| IP·UA 별 차단 | 특정 트래픽만 차단. 이번은 전체 공개 여부만. |

---

## 6. 구현 작업 단위

| # | 파일 | 작업 |
|---|---|---|
| 1 | `supabase/migrations/028_news_is_hidden.sql` | 컬럼 4개 추가 + partial index + RLS 정책 교체 |
| 2 | `lib/news-collectors/korea-kr.ts` (해당 수집 로직) | upsert 시 `is_hidden` 보존 로직 확인·수정 |
| 3 | `app/admin/news/actions.ts` (신규) | `toggleNewsHidden` server action + 검색 쿼리 |
| 4 | `app/admin/news/page.tsx` | 검색 블록 + 결과 리스트 + "최근 숨긴 뉴스 10건" 추가 |
| 5 | `app/news/[slug]/actions.ts` (신규) | `hideNews` server action |
| 6 | `app/news/[slug]/HideNewsButton.tsx` (신규) | admin 전용 버튼 + 모달 클라이언트 컴포넌트 |
| 7 | `app/news/[slug]/page.tsx` | hidden 시 410 Gone + noindex, admin 복원 배너, 버튼 분기 |

---

## 7. 리스크·주의사항

| 리스크 | 영향 | 대응 |
|---|---|---|
| RLS 변경 실수 | prod 뉴스가 모두 사라짐 | 028 마이그레이션 SQL 을 사장님이 직접 눈으로 한 번 더 확인. staging 환경 없이 prod 직행이므로 배포 직후 `/news` 목록 즉시 확인. |
| `revalidatePath` 누락 | 숨긴 뉴스가 ISR 캐시에 잠시 남음 | `/news`·`/news/[slug]`·`/` 세 경로 모두 revalidate. |
| 수집 upsert 로 hidden 덮어쓰기 | 다음 cron 에서 `is_hidden=false` 로 복원되는 회귀 | 1.4 대응: upsert 대상 컬럼에서 `is_hidden` 제외 또는 조건부 업데이트. |
| admin 오클릭 | 멀쩡한 뉴스 숨김 | 모달의 사유 입력 필수로 1단계 confirmation + 복원 fast path + 감사 로그. |
| 감사 로그 실패 | DB UPDATE 성공·로그 실패 시 추적 불가 | 기존 `logAdminAction` 이 try/catch 로 결과에 영향 없도록 처리됨 — 그대로 재사용. |

---

## 8. 검증 절차 (배포 후 사장님이 직접 확인)

1. admin 로그인 상태로 `/news` 열어서 아무 뉴스 하나 상세 페이지 이동.
2. 우상단 `이 뉴스 숨김` 버튼 확인. 클릭 → 사유 `기타` + 메모 `테스트` → 확인.
3. 시크릿 창에서 같은 URL 열면 `이 뉴스는 현재 비공개...` 페이지 확인 (410 Gone).
4. 시크릿 창에서 `/news` 목록 열어서 그 뉴스가 사라졌는지 확인.
5. admin 창으로 돌아와 `/admin/news` → 검색창에 그 뉴스 제목 일부 입력 → 결과에서 `복원` 버튼 클릭.
6. 시크릿 창 새로고침 → 원래 상세 페이지로 복원됐는지 확인.
7. `/admin` 감사 로그 페이지에서 `news_hide` + `news_unhide` 2건 기록 확인.
