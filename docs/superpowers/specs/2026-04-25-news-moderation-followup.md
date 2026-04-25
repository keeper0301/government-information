# 정책 뉴스 모더레이션 v1 — follow-up 이슈 정리

> **요약**: 모더레이션 v1 (`feat(news): 정책 뉴스 콘텐츠 모더레이션 v1`, ebeb765) prod 검증 중 발견된 follow-up 항목 2건. 핵심 acceptance criteria 9개 중 9개 모두 통과했으며 운영 차단 수준은 아니지만, 후속 작업으로 추적.

검증 일자: 2026-04-25 (KST 09:19 ~ 09:21)
검증자: claude (Opus 4.7) + 사장님 동석
검증 결과: spec 8장 모든 항목 PASS (HTTP 410, x-robots-tag, /news 목록 차단, 복원 후 200 OK 회복, 감사 로그 2건 정상 등)

---

## 이슈 1 — server action 직후 client 일시 에러 (FIXED)

### 증상
- HideNewsButton 모달 → "숨김 확정" 클릭 → DB 업데이트·감사 로그 모두 정상
- 직후 client 화면에 keepioo 공통 에러 페이지 (`문제가 생겼어요 / 페이지를 불러올 수 없어요`) 표시
- 새로고침 1회로 정상 admin 배너 페이지 회복

### 콘솔 에러 원문
```
[ERROR] Error: An unexpected response was received from the server.
[ERROR] [app/error] 렌더링 중 예외: Object
```

### 진단 과정 (가설 → 반증 순)

**가설 1**: middleware checkHiddenNews 가 server action POST·RSC payload fetch 까지 410 HTML 응답 → 응답 프로토콜 mismatch.
- 시도: middleware 에 `if (request.method !== "GET") return null` + `request.headers.has("rsc")` 가드 (commit 1de4ae3)
- 반증: 배포 후 재테스트 했지만 race 동일 발생. middleware 응답이 아니었음.

**가설 2**: server action 의 revalidateNewsRoutes 안 `revalidatePath("/sitemap.xml")` 가 next 의 file-route convention 을 인식 못 해 throw → server action 500.
- 시도: `/sitemap.xml` 호출 제거 + 나머지 호출 try/catch (commit 04fb34d)
- 반증: 배포 후 재테스트, race 동일. supabase logs 깨끗, 다른 곳에서 throw.

**가설 3 (CONFIRMED — Vercel runtime logs)**:
```
POST /news/%EC%83%9D%ED%99%9C%EC%9D%B4-%EC...148957664 → 500 → TypeError: Invalid character
```
`next/navigation` 의 `redirect()` 는 받은 path 를 HTTP `Location` 헤더에 그대로 set. `/news/생활이-어려우세요-...` 처럼 ASCII 외 문자(한글)가 들어 있으면 HTTP/1.1 헤더 ASCII 제약 위반해 throw → server action 500 → client `NEXT_REDIRECT` 처리 실패 → app/error 가 에러 페이지 렌더.

### 최종 수정 (commit ca2a2af)
`app/admin/news/actions.ts` 의 redirect 직전에 ASCII 외 문자만 percent-encode:
```ts
const returnTo = returnToRaw.replace(/[^\x00-\x7F]+/g, (s) => encodeURIComponent(s));
redirect(returnTo);
```
- 이미 `%xx` 로 인코딩된 부분은 ASCII 라 그대로 보존 → 더블 encode 위험 없음
- `/admin/news?msg=...` 같은 fallback 경로는 ASCII 라 영향 없음

### 부수적으로 유지된 robustness 개선 (1de4ae3 + 04fb34d)
가설 1·2 의 fix 도 자체로는 잘못된 방향이 아니라 robustness 향상이라 그대로 유지:
- middleware: server action POST 와 RSC fetch 에서 410 HTML 응답 안 함
- actions.ts: revalidatePath 호출들을 try/catch 로 감싸 일부 실패가 전체 server action 을 깨지 않도록

---

## 이슈 2 — 복원 직후 `/news` 목록 즉시 재노출 안 됨 (CLOSED — 오진단)

### 최초 증상 (관찰)
- `/admin/news` 검색에서 "복원" 클릭 직후 anon 으로 `/news` 첫 페이지를 fetch
- 해당 슬러그가 결과에 안 보였음 → 처음엔 ISR 캐시 lag 로 추정

### 실제 원인 (재조사)
검증 대상 뉴스의 `published_at` 기준 순위가 **135번째** (4월 24일 발행, 4월 25일 새로 수집된 뉴스 134건에 밀림). `/news` 첫 페이지는 페이지네이션상 12~24건만 표시 → 원래부터 첫 페이지에 안 들어가는 위치. 검증 방법론 자체의 오류였음.

```sql
with target as (
  select published_at from news_posts where slug = '생활이-어려우세요-...148957664'
)
select count(*) from news_posts, target
 where is_hidden = false and news_posts.published_at >= target.published_at;
-- → 135
```

### 결론
- `app/news/page.tsx` 의 `revalidate = 60` 은 이미 짧게 설정돼 있음 (확인됨)
- `toggleNewsHidden` 의 `revalidatePath` 호출은 정상 작동 중
- **수정 불요**

### 향후 동일 검증 시 권장
- 발행일이 새로운 (오늘자) 뉴스로 테스트하거나
- 직접 `/news/[slug]` URL 에 anon 접근해 200/410 만 확인 (목록 노출 여부는 별개)

---

## 이번 검증으로 확인된 기타 정상 동작

| 항목 | 검증 결과 |
|---|---|
| `<meta robots noindex,nofollow>` (admin metadata) | ✅ |
| `X-Robots-Tag: noindex, nofollow` (anon middleware response) | ✅ |
| `Cache-Control: public, max-age=0, s-maxage=60` (anon 410) | ✅ |
| 모달 사유 select 3종 (저작권/오보·오해소지/기타) 정상 | ✅ |
| 메모 input 200자 maxLength 정상 | ✅ |
| 한글 slug + decodeURIComponent 분기 정상 (`safeDecodeSlug`) | ✅ |
| admin 배너에 사유 + 숨긴 시각 정확 표시 | ✅ |
| 검색 결과 행에 "숨김"/"공개" 배지 + 사유 노출 정상 | ✅ |
| `admin_actions` 의 `news_hide` / `news_unhide` JSON details 무손실 | ✅ |
