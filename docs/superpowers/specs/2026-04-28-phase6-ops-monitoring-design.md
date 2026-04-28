# Phase 6 — 운영 모니터링 종합 (사고 조기 감지 + 장기 추세 + cron 정밀화 + /admin/health)

**작성일**: 2026-04-28
**대상**: keepioo.com 운영 모니터링 4 영역
**범위**: A 사고 조기 감지 + B 장기 추세 차트 + C cron 정밀화 + D /admin/health 종합 (~3~4h)

---

## 1. 동기

사이트 업그레이드 6 phase 중 마지막 Phase 6. 사장님 결정 — A·B·C·D 모두.

현재 상태:
- /admin 24h 지표 카드 6종 (방문·가입·구독·cron·알림 등) 이미 있음
- /admin/insights cohort funnel + 사용자 분포 + 24h 결제 신호 (Phase 4 추가)
- /admin/cron-failures 24h cron 실패 알림 카드
- /admin/alimtalk 카카오 로그
- /admin/my-actions 본인 행동 로그
- 가시화 카드 풍부하지만 **분산** — 사장님이 5~6 페이지 순회

→ Phase 6 의 가치: **운영 한 페이지 + 사고 자동 감지 + 장기 추세**.

---

## 2. Section 1 — 사고 조기 감지 (A)

### 2.1 신규 cron — `/api/cron/health-alert`

**스케줄**: 매일 09:00 KST (00:00 UTC)

**점검 + 발송 로직**:

| 임계치 | 발송 조건 | 메시지 |
|---|---|---|
| 가입 활성도 | 24h 신규 가입 = 0 + 7d 활성 사용자 < 5 | "가입 funnel 점검 필요" |
| 결제 실패 | 24h CHECKOUT_FAILED 이벤트 ≥ 1 (또는 subscriptions.status='past_due' 24h ≥ 1) | "결제 실패 X건 발생" |
| cron 연속 실패 | cron_failure_log 24h occurrences ≥ 3 (같은 jobName) | "cron Y 연속 실패" |

발송 채널:
- 사장님 이메일 (`keeper0301@gmail.com`) — Resend 사용 (기존 `lib/resend.ts` 또는 동등)
- subject: `[keepioo 운영] X건 임계치 초과`
- body: 각 임계치 + /admin/health 링크

**Vercel cron 등록**:

```json
// vercel.json (cron 추가)
{
  "crons": [
    {
      "path": "/api/cron/health-alert",
      "schedule": "0 0 * * *"
    }
    // ... 기존 crons
  ]
}
```

cron secret 검증 (기존 패턴 따라)

### 2.2 파일

- `app/api/cron/health-alert/route.ts` (신규, ~150라인)
- `vercel.json` cron 추가 (1라인)
- `lib/health-check.ts` (신규 — 점검 로직 분리, /admin/health 도 재사용)

---

## 3. Section 2 — 장기 추세 차트 (B)

### 3.1 차트 3종 (30일)

| 차트 | 데이터 | 형식 |
|---|---|---|
| **DAU 라인** | auth.users.last_sign_in_at 일별 distinct count | SVG line chart |
| **구독 신규/취소 bar** | subscriptions 일별 created/cancelled (중첩 또는 grouped bar) | SVG bar chart |
| **콘텐츠 발행 bar** | blog_posts·news_posts 일별 created | SVG bar chart |

### 3.2 라이브러리·구현

**라이브러리 신규 X** — 단순 SVG line·bar 컴포넌트 직접 작성 (Phase 1 성능 보존, recharts 같은 무거운 라이브러리 회피).

```tsx
// 단순 SVG bar 예시 (~30라인)
function SimpleBarChart({ data }: { data: { date: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <svg viewBox={`0 0 ${data.length * 12} 60`} className="w-full h-16">
      {data.map((d, i) => (
        <rect
          key={d.date}
          x={i * 12}
          y={60 - (d.value / max) * 60}
          width={10}
          height={(d.value / max) * 60}
          className="fill-blue-400"
        />
      ))}
    </svg>
  );
}
```

### 3.3 파일

- `lib/admin-trends.ts` (신규 — 30일 일별 count 쿼리 3종)
- `components/admin/trend-charts.tsx` (신규 — SVG line·bar 컴포넌트 + 표시)

### 3.4 데이터 쿼리 패턴

```sql
-- DAU (last_sign_in_at 일별)
SELECT DATE_TRUNC('day', last_sign_in_at AT TIME ZONE 'Asia/Seoul') AS day,
       COUNT(DISTINCT id) AS dau
FROM auth.users
WHERE last_sign_in_at >= NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day;
```

application 측에서 30일 fill-zero (값 없는 날도 0 표시).

---

## 4. Section 3 — cron 정밀화 (C)

### 4.1 환경변수화

`cron_failure_log` 알림 임계치 hard-coded 3회 → `CRON_FAIL_ALERT_THRESHOLD` 환경변수 (default 3).

기존 cron 알림 코드 위치 grep 후 환경변수 적용.

### 4.2 수동 retry 버튼

`/admin/cron-failures` 의 각 cron prefix 행에 "수동 재실행" 버튼:
- 클릭 → POST `/api/admin/cron-retry` (server action 또는 API)
- body: `{ jobName }` 또는 `{ cronPath }`
- server 가 해당 cron 의 path (예: `/api/collect-news`) 를 internal fetch
- 결과 toast: "재실행 완료 (X건 신규)" 또는 에러

### 4.3 파일

- `app/api/admin/cron-retry/route.ts` (신규)
- `app/admin/cron-failures/page.tsx` retry 버튼 추가 (수정)
- 기존 cron 알림 임계치 hard-coded 위치 환경변수 적용

---

## 5. Section 4 — `/admin/health` 종합 대시보드 (D)

### 5.1 페이지 구조

신규 `app/admin/health/page.tsx` — 한 페이지에 운영 정보 통합:

**위에서 아래로**:

1. **헬스 신호 4 카드** (실시간 신호)
   - Supabase 상태 (status: ACTIVE_HEALTHY 등)
   - Vercel 배포 상태 (마지막 배포 시간·status)
   - cron 24h 실패 알림 (count)
   - 이메일/카카오 발송 24h 실패 (count)

2. **24h 지표 6 카드** (기존 /admin 의 카드 그대로)
   - 가입·구독·결제·콘텐츠·cron·알림

3. **24h 결제 신호 카드** (기존 /admin/insights 의 Phase 4 카드)

4. **장기 추세 차트 3종** (Section 2 결과)

5. **cohort funnel** (기존 /admin/insights — 전체·30일)

6. **최근 cron 실패 30건** (기존 /admin/cron-failures 의 테이블)

7. **사장님 본인 행동 로그 최근 5건** (기존 /admin/my-actions 의 테이블 발췌)

### 5.2 컴포넌트 재사용

- 기존 컴포넌트가 분리 가능한 형태면 그대로 import
- 페이지 내장 분리 안 된 컴포넌트는 lib/admin-* 의 데이터 쿼리만 재사용

### 5.3 /admin 메인 page.tsx 의 변경

상단에 "/admin/health 종합 대시보드 보기" CTA 카드 추가 (사장님 매일 첫 클릭 유도).

### 5.4 파일

- `app/admin/health/page.tsx` (신규)
- `app/admin/page.tsx` health CTA 카드 추가 (수정)
- `lib/health-check.ts` (신규 — 헬스 신호 4 카드 데이터, Section 1 과 공유)

---

## 6. 검증·롤백

### 검증
- typecheck/build 통과
- chrome 검증: /admin/health 정상 노출 + 차트 동작 + 카드 데이터 정확
- A cron health-alert 1회 수동 trigger (POST /api/cron/health-alert with secret) → 사장님 이메일 발송 확인
- C retry 버튼 클릭 → cron 즉시 재실행 + toast

### 회귀 trigger (즉시 revert)
- /admin/health 가 하나라도 카드 500 에러
- 헬스 alert 가 임계치 미충족인데 발송 (false positive)
- cron retry 가 잘못된 cron 호출

### prod 영향
- 마이그레이션 0 (DB 변경 없음)
- 환경변수 1 신규 (`CRON_FAIL_ALERT_THRESHOLD` — default 3, 미설정 시 기존 동작)
- vercel.json cron 1 신규

---

## 7. 의존성·리스크

### 의존성
- Resend (기존 사용 중)
- Supabase admin client (기존)
- Vercel cron (기존)

### 리스크

| 리스크 | 완화책 |
|---|---|
| health-alert 가 false positive 폭주 (매일 가입 0 알림 짜증) | 임계치 조합 (가입 0 + 활성 < 5) — 둘 다 충족만 알림 |
| /admin/health 페이지 데이터 쿼리 N+1 | Promise.all 병렬 + react cache + count(exact) head:true |
| 차트 SVG 가 mobile 작은 화면에서 깨짐 | viewBox + responsive width |
| cron retry 가 같은 cron 동시 실행 위험 | retry 누른 후 5분 cooldown (button disabled) |
| Resend 일일 한도 (free 100/day) | 임계치 알림은 매일 최대 1건이라 안전 |

### 외부 대기 (사장님 액션)
- 환경변수 등록 (선택, default 3 그대로 OK)
- /admin/health 매일 점검 — 사장님 routine 형성

---

## 8. 성공 기준

- ✅ /admin/health 페이지 정상 노출 + 모든 카드 데이터 정확
- ✅ A cron health-alert 매일 09:00 KST 자동 실행 (vercel cron 등록 확인)
- ✅ 임계치 충족 시 사장님 이메일 발송 (수동 trigger 검증)
- ✅ B 장기 추세 차트 30일 데이터 정확 표시
- ✅ C retry 버튼 동작 + toast 결과
- ✅ chrome console 에러 0
- ✅ lighthouse 회귀 < 5점 (admin 페이지라 영향 미미)

위 7개 모두 충족 시 Phase 6 완료. 6 phase 마무리.
