# AdSense 재신청 가이드 (5/17 이후)

> **작성일**: 2026-05-16
> **대상**: 사장님 직접 액션 (외부 콘솔)
> **사전 조건**: 4-23 등록 후 거절 받음, 5/11 가속 13 commit 적용, 5/16 v10 카드 가독성 마감

## 1. 재신청 전 체크 (5/17~5/24)

### 1-1. 백필 효과 확인
4월 백필 4배 적용 (5/11 commit) 이후 1주차 트래픽 점검.

```
/admin/health → 24h 페이지뷰 / 7일 추세 확인
GA4 → 활성 사용자 비교
Search Console → 클릭/노출 추세 (sc_no_clicks alert 없는지)
```

**목표**: 7일 누적 페이지뷰 ≥ 500 / 활성 사용자 ≥ 100. 이하면 트래픽 더 쌓기 권장 (재신청 보류).

### 1-2. unique_insight 백필 확인
DDL 083 (5/10) 의 unique_insight 컬럼 채워진 글 비율.

```
/admin/blog-quality → unique_insight 채움률 ≥ 80% 확인
```

### 1-3. UI 발췌 (10영역) 확인
5/11 commit (ec5eca8) 의 UI 발췌 일관성 — 카테고리 hub / About / FAQ / blog 카드 / sidebar.

```
모바일에서 keepioo.com 접속 → 각 페이지 발췌 노출 확인
```

### 1-4. 카드 가독성 (5/16 v10) — 인스타 트래픽 유입 시 첫 인상
인스타 carousel 클릭 → keepioo.com 진입 사용자 경험 점검.

## 2. 재신청 (AdSense 콘솔)

1. https://adsense.google.com 로그인
2. 사이트 → keepioo.com → **거절 이유 확인**
3. **"검토 요청"** 버튼 클릭
4. (사이트가 비활성화된 경우) 사이트 추가 → keepioo.com 다시 등록

## 3. 거절 시 대응 (사유별)

### "가치 별 콘텐츠" (4-23 거절 사유)
- 5/10~5/11 fix 적용됨 (백필 4개월 + noindex 면제 + 페르소나 4종 + unique_insight)
- 재거절 시: 사장님이 직접 작성한 블로그 글 5건+ 추가 권장 (sample 확장)

### "사이트가 작동하지 않음"
- /admin/health 즉시 확인 (사이트 다운 사고)
- middleware/home-stats timeout (5/8 영구 적용) 작동 확인

### "탐색이 어려움" / "사이트 디자인"
- 모바일 nav (5/13 폴드7 메인 fix) 작동 확인
- 푸터 외부 link (5/11 commit a26fef1) 노출 확인

## 4. 승인 후 액션

### 즉시
1. ADSENSE_PUBLISHER_ID env 등록 (Vercel)
2. ads.txt 자동 노출 확인 (`curl https://www.keepioo.com/ads.txt`)
3. `/admin/health` → AdSense 카드 상태 READY 전환 확인

### 1주차 모니터링
- `adsense_zero_revenue` alert 무시 (광고 채워지기 1~7일 필요)
- /admin/autonomous → AdSense KPI 누적 추세 확인
- 5/16 fix (currency KRW + 빈 계정 graceful) 효과 — 알람 폭주 없음 확인

## 5. 관련 메모리

- `project_keepioo_adsense_acceleration_2026_05_11.md` — 가속 13 commit 종합
- `project_keepioo_adsense_rejection_response_2026_05_10.md` — 거절 4 영역 fix
- `project_keepioo_adsense_followup_2026_05_10.md` — currency + cooldown spec (5/16 commit d35f861 적용 완료)
- `reference_adsense_root_domain_only.md` — www. 등록 거부 사고
