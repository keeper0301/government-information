# AdSense 재신청 가이드 (5/24 권장)

> **작성일**: 2026-05-16 (5/17 진단으로 5/24 시점 권장 보정)
> **대상**: 사장님 직접 액션 (외부 콘솔)
> **등록일**: 2026-04-23 / **거절일**: 2026-05-10 (5/17 기준 거절 +7일)
> **권장 재신청 시점**: 2026-05-24 (거절 +14일, 1~2주 권장 범위 중앙)
>
> **5/17 진단 결과**: welfare unique_insight 1.43% (5/11 가속 메모리 예상의 21%).
> 원인: 인기순 fetch 50건 중 98% sparse skip → cron당 1건만 처리.
> 5/17 commit 5a66105 로 fetch over-fetch + client filter fix (cron당 25건 목표).
> fix 효과 1주 누적 후 5/24 재신청 권장.
> **사전 조건 충족**:
>   - 5/11 가속 13 commit 적용 (백필 4개월 + noindex 면제 + 페르소나 4종 + UI 발췌 10영역)
>   - 5/16 v10 카드 가독성 마감
>   - 5/16 contrast 8 영역 fix 적용 (학생·교육·주거·노년·문화 색상 + 그라디언트)
>   - 5/16 Phase A 거주지 정책 매칭 (사장님 순천시 47건, 사용자별 정확 매칭)
>   - 5/16 Phase B 시·군 보도자료 자동 수집 cron 가동 (순천+광주, 매일 KST 09:00)
>   - 5/16 Phase C 홈/마이페이지 "내 지역 정책" 섹션 — AdSense 검수자 시각 영향 ↑

## 1. 재신청 전 체크 (5/17~5/24)

### 1-1. 백필 효과 확인
4월 백필 4배 적용 (5/11 commit) 이후 1주차 트래픽 점검.

```
/admin/health → 24h 페이지뷰 / 7일 추세 확인
GA4 → 활성 사용자 비교
Search Console → 클릭/노출 추세 (sc_no_clicks alert 없는지)
```

**목표**: 7일 누적 페이지뷰 ≥ 500 / 활성 사용자 ≥ 100. 이하면 트래픽 더 쌓기 권장 (재신청 보류).

### 1-2. unique_insight 백필 확인 (5/17 보정)
DDL 083 (5/10) 의 정책 unique_insight 컬럼 채워진 비율 — blog_posts 가 아니라 welfare/loan_programs 컬럼.

```
/admin/autonomous → Phase 3 "정책 해설 진행률 N/total %" metric
```

**목표 (5/24 재신청 시점)**: welfare ≥ 8%, loan ≥ 50%. 5/17 commit 5a66105 fix 효과 1주 누적 가정.
이하면 cron 재 사고 신호 → /admin/cron-trigger 에서 수동 trigger 후 추세 재확인.

### 1-3. UI 발췌 (10영역) 확인
5/11 commit (ec5eca8) 의 UI 발췌 일관성 — 카테고리 hub / About / FAQ / blog 카드 / sidebar.

```
모바일에서 keepioo.com 접속 → 각 페이지 발췌 노출 확인
```

### 1-4. 카드 가독성 (5/16 v10) — 인스타 트래픽 유입 시 첫 인상
인스타 carousel 클릭 → keepioo.com 진입 사용자 경험 점검.

### 1-5. (5/17 신규) 거주지 정책 매칭 효과 확인
사장님 본인 화면에서 5/16 Phase A~C 효과 즉시 확인 가능:

```
1. https://www.keepioo.com 로그인 (사장님 계정)
2. 홈 페이지 → "🏛️ 전남 순천시" 섹션 확인 (사장님 47건 매칭)
3. 마이페이지 → "내 지역" 탭 (5번째 탭) 확인
4. /admin/scrape-local → 매일 KST 09:00 cron 가동 결과 (순천+광주 보도자료 자동 수집)
```

**AdSense 검수자 관점**: 사용자 거주지 매칭 = "사용자 가치 있는 콘텐츠" 신호.
4-23 거절 사유 "가치 별 콘텐츠" 의 직접 응답.

## 2. 재신청 (AdSense 콘솔)

1. https://adsense.google.com 로그인
2. 사이트 → keepioo.com → **거절 이유 확인**
3. **"검토 요청"** 버튼 클릭
4. (사이트가 비활성화된 경우) 사이트 추가 → keepioo.com 다시 등록

## 3. 거절 시 대응 (사유별)

### "가치 별 콘텐츠" (4-23 거절 사유)
**5/16 추가 fix 적용** (4-23 ~ 5-17 24일 누적):
- 5/10~5/11: 백필 4개월 + noindex 면제 + 페르소나 4종 + unique_insight
- 5/16 contrast fix 8 영역 (사용자 시각 가독성 ↑) → "낮은 가치" 신호 해소
- 5/16 Phase A 거주지 매칭 (사용자별 47건 정확 노출) → "관련성 높은 콘텐츠"
- 5/16 Phase B 시·군 보도자료 매일 자동 수집 → "신선한 콘텐츠" 신호
- 5/16 Phase C 홈/마이페이지 거주지 섹션 → 사용자 가치 명시

**재거절 시 사장님 추가 액션 (드물게)**:
- 사장님 직접 작성한 블로그 글 5건+ 추가 (sample 확장)
- 광역 정책 외 시·군 직접 콘텐츠 (예: "전남 순천시 청년 사업 가이드") 추가
- 메모리 보강 logic — D-4 step 1~4 가동 후 자동 fix 누적 (5/19~ 매주 cron)

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
