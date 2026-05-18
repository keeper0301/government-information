# AdSense 승인·거절 사후 액션 가이드 (2026-05-18)

> **작성일**: 2026-05-18
> **트리거**: 5/18 재신청 검수 결과 도착 (5/23~6/1 예상)
> **자동 감지**: `/api/cron/adsense-review-watch` (KST 10:05) + `/api/cron/adsense-gmail-watch` (KST 10:10, OAuth 등록 시)

## 시나리오 1 — 승인 🎉 (state READY 또는 Gmail "approved")

### 자동 알림 도달 (사장님 텔레그램+SMS)
```
[keepioo] AdSense 승인 통과 🎉
account.state NEEDS_ATTENTION → READY 전환 감지

[다음 액션]
1. Vercel env 에 ADSENSE_PUBLISHER_ID 등록
2. ads.txt 노출 확인 (curl https://www.keepioo.com/ads.txt)
3. /admin/external-console 의 AdSense 카드 READY 확인
4. 1주차 모니터링 (수익 누적, 광고 게재 비율)
```

### 사장님 즉시 액션 (5분)

1. **Vercel env 등록**
   ```
   https://vercel.com/keeper0301-8938s-projects/government-information/settings/environment-variables
   ```
   - Name: `NEXT_PUBLIC_ADSENSE_ID`
   - Value: `ca-pub-XXXXXXXXXXXXXXXX` (AdSense 콘솔 → 광고 → 광고 단위)
   - Target: **Production** + Sensitive
   - Save + Redeploy

2. **광고 단위 생성 (AdSense 콘솔)**
   ```
   https://adsense.google.com → 광고 → 광고 단위 → "인피드 광고" 생성
   ```
   - 슬롯 ID 확보 → `NEXT_PUBLIC_ADSENSE_SLOT_INFEED` env 추가
   - 레이아웃 키 확보 → `NEXT_PUBLIC_ADSENSE_LAYOUT_INFEED` env 추가

3. **검증 (3분)**
   ```bash
   curl https://www.keepioo.com/ads.txt
   # 결과: google.com, pub-XXXXX, DIRECT, f08c47fec0942fa0
   ```
   - 모바일에서 keepioo.com 접속 → in-feed 광고 노출 확인
   - 자동광고 (enable_page_level_ads) 도 자동 활성

### 1주차 모니터링 (5/24~5/31)

- `/admin/autonomous` → `external_console_check_run` 의 `account_state=READY` 확인
- 24h 수익 (KRW) 누적 추세
- `adsense_zero_revenue` alert (트래픽 0 사고) 발화 안 함 확인
- AdSense ad density 정책 (광고 > 콘텐츠) 모니터링

## 시나리오 2 — 거절 (state DISABLED 또는 Gmail "rejected")

### 자동 알림 도달
```
[keepioo] AdSense 거절 (DISABLED)
account.state NEEDS_ATTENTION → DISABLED 전환 감지

[다음 액션]
1. https://adsense.google.com → 사이트 keepioo.com → 거절 사유 확인
2. 메모리 [adsense-rejection-response] 따라 사유별 fix
3. 1~2주 fix 누적 후 재신청
```

### 사장님 즉시 액션 (10분)

1. **거절 사유 확인** (AdSense 콘솔)
2. **사유별 분류**:
   - "가치 별 콘텐츠" (3번째 거절) → welfare 백필 누적 추가 + 사장님 직접 작성 글 5건
   - "정책 위반" → 위반 항목 fix
   - "사이트 작동 X" → `/admin/health` 확인
   - "탐색 어려움" → 모바일 nav 확인

3. **메모리 기록** (다음 세션 클로드)
   ```
   "AdSense 5/23 거절 사유: <사유>. 클로드에게 알려서 fix 진행 부탁드림"
   ```

### 메모리 자동 갱신 (선택 — 다음 cron 가동 시)

`project_keepioo_adsense_resubmission_failed_2026_05_18.md` 의 후속 갱신:
- 거절 사유 명시 + fix 계획
- 다음 재신청 권장 시점 (거절 +7~14일)

## 클로드 자동 후속 (env 등록 후)

검수 통과 시 클로드가 자동 가동 가능:
- `lib/external-console/adsense.ts` 가 state=READY → KPI 수익 누적 시작
- daily-digest cron 매일 KST 08:00 사장님 SMS 에 AdSense 수익 1줄 자동 포함
- weekly-ops-digest 매주 화 KST 09:00 7일 누적 수익 보고

## 시나리오 3 — 검수 14일 초과 (state 변경 없음)

5/24+14 = 6/7 시점에도 NEEDS_ATTENTION 유지 시:
- 사장님이 https://adsense.google.com/contact 에서 Google 지원 문의
- 평균 검수 5~14일이라 14일 초과는 이례적

## 참조

- 메모리: [[keepioo-adsense-resubmission-failed-2026-05-18]] — 5/18 재신청 + 거절 대응
- 메모리: [[keepioo-adsense-rejection-response-2026-05-10]] — 5/10 첫 거절 사유별 fix
- 메모리: [[reference_adsense_root_domain_only]] — www. 등록 거부 사고
- 코드: `lib/external-console/adsense.ts` — state polling + KPI
- 코드: `app/api/cron/adsense-review-watch/route.ts` — state 전환 감지
- 코드: `app/api/cron/adsense-gmail-watch/route.ts` — Gmail 이메일 자동 파싱
