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

### 근본 원인
middleware `checkHiddenNews` 가 GET 페이지 로드 외 요청 — 특히 server action 직후 next router 가 보내는 RSC payload fetch 와 server action POST — 에 대해서도 `text/html` 410 응답을 반환했음. Next.js 16 의 client router 는 RSC payload 자리에 raw HTML 이 오면 응답 프로토콜 불일치로 즉시 throw → keepioo `app/error` 가 이를 받아 에러 페이지 렌더.

### 수정 (commit 1de4ae3)
`lib/news-moderation/middleware-check.ts` 에 가드 2줄 추가:
```ts
if (request.method !== "GET") return null;
if (request.headers.has("rsc") || request.headers.has("next-action")) return null;
```
- 첫 줄: server action POST 같은 비-GET 은 통과 (page.tsx 가 admin 분기로 정상 처리)
- 둘째 줄: next router 의 RSC prefetch / server action invoke 헤더가 있는 요청도 통과
- 일반 GET (시크릿 창 직접 접근, SEO 봇, 사용자 URL 입력) 만 410 처리 — anon 410 시그널은 그대로 유지

### 검증
- 이 spec 작성 시점엔 미푸시 상태. 푸시 후 prod 에서 다시 토글 테스트 필요.
- 회복 확인 후 본 이슈 CLOSE.

---

## 이슈 2 — 복원 직후 `/news` 목록 즉시 재노출 안 됨 (OPEN)

### 증상
- `/admin/news` 검색에서 "복원" 클릭 → DB 즉시 `is_hidden=false`, 감사 로그 정상
- 그 직후 anon 으로 `/news` 목록을 fetch 하면 그 슬러그가 0건 (복원 전과 동일)
- 직접 `/news/[slug]` URL 은 HTTP 200 정상 응답 → SEO·사용자 직접 접근에는 문제 없음

### 근본 원인 (가설)
`app/admin/news/actions.ts` 의 `toggleNewsHidden` 안에서 호출하는
`revalidatePath("/news")` / `revalidatePath("/")` / `revalidatePath("/sitemap.xml")`
가 Vercel Edge Cache 까지 즉시 무효화되지 않을 가능성. 다음 ISR 갱신 사이클 (최대 `revalidate=3600`) 또는 다음 cron 수집 사이클까지 stale HTML 이 served.

다음 중 하나 또는 조합:
- `revalidatePath` 가 Next.js Data Cache 만 무효화하고 Full Route Cache 까진 즉시 안 닿음
- Vercel CDN edge node 별 propagation lag (지역별로 다른 응답 가능)
- `/news` 페이지가 `force-dynamic` 이 아니어서 ISR 캐시 우선

### 영향 평가
- **사용자 영향**: 복원된 뉴스가 잠시 (몇 분 ~ 1시간) 목록에 안 보임. 직접 URL·관련 공고 매칭에서는 정상 노출.
- **SEO 영향**: 없음 (HTML 자체는 200 + canonical 정상).
- **운영 영향**: admin 본인이 "복원했는데 안 보이네?" 혼란 가능. 새로고침 또는 시간 경과로 해결됨.

### 후보 수정 방향 (선택)
1. **(권장)** `app/news/page.tsx` 의 `revalidate` 를 3600 → 60 으로 낮춤 → 최대 1분 lag.
2. `toggleNewsHidden` 에서 `revalidatePath("/news", "layout")` 까지 호출해 Full Route Cache 무효화 시도.
3. 복원 시 `/admin/news?msg=restored` 안내 토스트에 "최대 1분 후 목록에 다시 표시돼요" 한 줄 추가 → UX 기대값 맞춤.

### 우선순위
중간. 모더레이션 사용 빈도 자체가 월 1~5건 (스펙 가정) 이라 사장님 혼란이 누적될 가능성은 낮음. 다만 1번 옵션은 1줄 변경이고 ROI 좋음.

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
