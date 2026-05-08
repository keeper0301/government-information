# LLM 자동 판단 임계 낮추기 spec

작성일: 2026-05-08
연관: `2026-05-07-admin-automation-master-design.md` § 3.3 (sub-project #3)
상태: **사장님 명시 승인 대기** — 본 문서는 분석·설계만, 코드 변경 없음

## 0. 요약 (사장님용 한 페이지)

**목표**: 어드민 자동화 마스터 6/7 완료 후 마지막 남은 위험 작업. dedupe·news 자동 판단 임계를 낮춰 사장님 검수 부담 ↓ + 자동 처리 영역 ↑.

**진단 결과 (2026-05-08 prod, 본 문서 § 1)**:

| 지표 | 현재 값 | 의미 |
|---|---|---|
| dedupe pending review (검수 대기) | welfare 0건, loan 1건 | 부담 거의 없음. 임계 낮춤 효과 작음 |
| dedupe 자동 confirm (30일) | **0건** | 0.95 임계가 너무 높아 사실상 작동 안 함 |
| dedupe 사장님 confirm (30일) | 1건 | 정밀도 데이터 부족 |
| news 24h 자동 hide | 36건 / 359건 (10%) | LLM 모더레이션 정상 작동 |
| news 24h 미분류 backlog | **269건** | cron 3회 × 30 cap = 90/일 → backlog 형성 |
| welfare LLM 매칭 | **코드 없음** | 신규 도입 작업 (별 sub-project 수준) |

**핵심 결정**:

1. **dedupe 0.95 → 0.85 낮춤**: 데이터로는 ROI 작음 (현재 부담 1건). 그러나 **신규 정책 유입 늘어나는 추세** + **0.85~0.95 페어 정밀도 데이터 0건** 이라 위험 측정 불가. → **점진 도입 필수** (0.95 → 0.92 → 0.88 → 0.85, 4주).
2. **news cron cap 확대**: 임계 낮춤보다 **cap 30 → 100** 이 ROI 큼 (backlog 해소). 본 문서 § 3 에서 다룸.
3. **welfare LLM 매칭**: 별도 sub-project 수준 작업. 본 spec 에서는 **범위 제외 권고** (마스터 #3 분리 결정).

## 1. 현재 임계 분석 (코드 + prod 데이터)

### 1.1 dedupe (welfare/loan 중복 정책)

**코드 위치**:
- 매칭 알고리즘: `lib/dedupe/welfare-loan.ts:93` — `SCORE_THRESHOLD = 0.7` (페어 검출 임계)
- 자동 confirm 임계: `app/api/dedupe-detect/route.ts:30` — `AUTO_CONFIRM_SCORE_THRESHOLD = 0.95`
- 자동 confirm 추적: `supabase/migrations/074_dedupe_auto_confirm.sql` (welfare/loan `dedupe_auto_confirmed_at` column)
- 사장님 검수 UI: `/admin/dedupe` (페이지 `app/admin/dedupe/page.tsx`, 액션 `app/admin/dedupe/actions.ts`)

**현재 동작**:
- 매일 02:00 KST cron `/api/dedupe-detect` 가 신규 row 7일분 × 활성 row 페어링.
- score ≥ 0.7 페어 → `duplicate_of_id` 채움 (검수 대기).
- score ≥ 0.95 페어 → 추가로 `dedupe_auto_confirmed_at` 동시 채움 (사장님 검수 큐 자동 제외).
- 0.7~0.95 페어만 사장님 `/admin/dedupe` 검수 큐에 노출.

**점수 가중**: title 0.4 + region 0.2 + applyEnd 0.2 + benefitTags 0.2 (합 1.0).

**prod 진단 결과 (2026-05-08 KST 19:48)**:

```json
welfare: { pending_review: 0, auto_confirmed_total: 0, active_total: 10,276 }
loan:    { pending_review: 1, auto_confirmed_total: 0, active_total: 1,314 }
admin_actions (30일):
  dedupe_confirm: 1건
  dedupe_reject: 0건
  dedupe_auto_confirm: 0건
```

**관찰**:
- **자동 confirm 0건 = 0.95 임계가 사실상 dead code**. 30일간 0.95 이상 페어가 한 번도 발생하지 않음.
- 검수 대기는 1건 (loan). welfare 는 0건 → 임계 0.7 페어 검출 자체가 드묾.
- 사장님 부담은 거의 없는 상태. **임계 낮춤 ROI 가 작음**.

### 1.2 news LLM 자동 모더레이션

**코드 위치**:
- 분류 호출: `lib/news/classify.ts` (Anthropic Claude Haiku 4.5)
- 자동 hide 임계: `lib/news/classify.ts:145` — `AUTO_HIDE_CONFIDENCE_THRESHOLD = 0.7`
- cron: `app/api/cron/news-classify/route.ts` (KST 11:30 / 14:30 / 17:30, cap 30/회)
- 결정 로직: `decideAutoModeration(result)` — `confidence ≥ 0.7 AND (is_advertorial OR is_copyright_risk)` 일 때만 hide.

**판별 영역**:
1. `is_advertorial` (광고성)
2. `is_copyright_risk` (저작권 위반)
3. `confidence` (0.0~1.0)

**prod 진단 결과**:

```
news 24h: total 359건, classified 90건, hidden 36건
news 7d:  total 1,481건, hidden 36건
news_auto_hide (admin_actions 30d): 36건 (= 24h 와 동일 → 최근 시작된 기능)
```

**관찰**:
- 24h 신규 359건 vs classified 90건 → **미분류 backlog 269건/일 누적**. cap 30 × 3 cron = 90/일 한도가 짤림.
- 분류된 90건 중 36건 hide (40%) — 광고성 비율이 높은 매체 (네이버 뉴스 RSS) 특성.
- **임계 0.7 자체는 합리적**. 실제 위양성 (사용자 정상 글이 hide) 사례는 admin_actions 추적 가능 — 현재 reject 액션 0건 추정 (별도 unlabel 액션 부재).

### 1.3 welfare LLM 매칭 (정책 자격 자동 분류)

**코드 위치**: **존재하지 않음**.

`Grep welfare.*LLM|welfare.*classify|policy.*classify` 결과 — welfare/loan 정책에 대한 LLM 자동 매칭/분류 코드 없음.

press-ingest (보도자료) 의 `lib/press-ingest/filter.ts` 는 별개 영역 (보도자료 → news_posts 변환).

마스터 spec § 3.3 은 "welfare 신규 정책 등록 시 LLM 카테고리·자격 자동 매칭" 을 언급하지만, 이는 **신규 sub-project 수준 작업** (DDL 추가 + Anthropic 호출 추가 + UI). 본 spec § 7 에서 **범위 제외 권고**.

## 2. 임계 낮춤 시나리오 분석

### 2.1 dedupe 0.95 → 0.85 낮춤

**예상 영향 (가설)**:
- 자동 confirm 률: 현재 0건 → ?건. 0.85~0.95 페어 분포 데이터 없어 정확 추정 불가.
- 위양성 위험: title 0.85 (substring match) + region 0.5 (광역 prefix) + applyEnd 0 + benefitTags 0 = **0.4×0.85 + 0.2×0.5 + 0 + 0 = 0.44** → **0.85 미만**. 즉 0.85 도달은 (title 정확 또는 substring) + (region 또는 applyEnd 일치) 둘 다 필요 → 신뢰도 비교적 높음.
- 그러나 prod 데이터로 검증 못 함 (자동 confirm 0건).

**위험 시나리오**:
- "청년수당" + "청년 수당 공고" 같은 변형 페어가 있을 수 있음 (title 0.85, region 1.0, applyEnd 1.0, tags 1.0 = 0.94). 이미 0.95 미만이므로 사장님 검수 큐로 갔어야 함 → 그러나 검수 큐도 0건이라 데이터 부족.
- false positive 시 사용자가 **자동 hide 된 정책을 못 봄** = 정책 노출 누락 (사고 등급 中-高).

### 2.2 news 임계 변경 (0.7 → 0.6 가정)

**예상 영향**:
- 자동 hide 률 ↑ — 사장님 검수 부담 ↓.
- 그러나 0.5~0.7 confidence 는 **Haiku 가 애매하다 표시한 영역**. false positive 위험 ↑.
- 사용자가 정상 정책 뉴스를 못 보는 사고 발생 가능.

**대안 (강력 권고) — 임계 낮춤 대신 cap 확대**:
- 현재 cap 30 × 3 cron = 90/일. 24h 유입 359건 대비 25%.
- cap 100 으로 확대 시 300/일 → 84% 처리. 임계 변경 없이 backlog 해소.
- 비용: Anthropic Haiku ~$0.003/건 × 300 = 일 ~$0.9 (월 ~$27). 기존 90/일 (월 ~$8) 대비 ~$19 추가.
- **위험 0** (임계 그대로, 처리량만 늘림). ROI 가 임계 낮춤보다 압도적.

### 2.3 welfare LLM 매칭 (신규 도입)

**범위 제외 권고**. 사유:

- 신규 sub-project 수준 — DDL (분류 결과 column) + Anthropic 호출 + 사장님 검수 UI + 비용 예측 + cron 추가.
- 마스터 spec § 3.3 자체에 "welfare 자동 검증 추가" 로 짧게 언급되었지만, 본 spec § 1.3 에서 코드가 0 임을 확인했으므로 별도 spec (`2026-MM-DD-welfare-llm-classify-design.md`) 으로 분리하는 게 안전.
- 본 spec 에서 작업 시 **사장님 명시 승인 항목 폭증** + 임계 낮춤 본질에서 멀어짐.

## 3. 점진 도입 vs 즉시 도입 비교 (dedupe)

### 3.1 점진 도입 (권장)

| 주차 | 임계 | 환경변수 | 모니터링 |
|---|---|---|---|
| W1 | 0.95 → 0.92 | `DEDUPE_AUTO_CONFIRM_THRESHOLD=0.92` | 자동 confirm 발생량 + 사장님 reject 비율 |
| W2 | 0.92 → 0.88 | `=0.88` | 동일 |
| W3 | 0.88 → 0.86 | `=0.86` | 동일 |
| W4 | 0.86 → 0.85 | `=0.85` | 4주 누적 reject ≤ 5% 면 유지, 초과 시 rollback |

**장점**: 단계마다 1주 데이터 확보 후 결정 → 사고 발생 시 즉시 직전 임계로 복귀.

**단점**: 4주 모니터링 부담 (사장님이 매주 weekly-ops 이메일에서 sample 검토 필요).

### 3.2 즉시 도입

**장점**: 1주 만에 효과 측정 종료.

**단점**:
- prod 데이터 부족 (자동 confirm 0건, reject 0건) — 안전 마진 없음.
- 첫 1주에 사고 발생하면 사장님 인지 시점이 안전망 #6 의 weekly 샘플 (최대 7일) 까지 지연.
- **권장하지 않음**.

### 3.3 결정 권고

**점진 4주 + 환경변수 toggle** 채택. 사장님이 4주 동안 weekly-ops 이메일 한 번씩 확인만 하면 됨.

## 4. 안전망 활용 방안

### 4.1 기존 안전망 (이미 가동 — `commit 8b53617`)

- 매주 화요일 KST 09:00 weekly-ops 이메일에 **auto-confirm 무작위 샘플 5건** 포함.
- 사장님이 이메일에서 5건 확인 → 잘못된 것 발견 시 `/admin/dedupe` 진입해 reject.
- DB column: `dedupe_auto_confirmed_at` (074 마이그레이션).

### 4.2 본 임계 낮춤 진행 시 보강 (필요)

**Option A — daily 무작위 샘플 추가 (권장)**:
- 매일 KST 08:00 daily-digest SMS 또는 이메일에 무작위 샘플 1건 추가.
- 즉시 인지 → 사고 발생 시 최대 24h 지연 (기존 7일 → 24h).
- 부담: 매일 1건 클릭만 추가. SMS 길이는 진입 link 한 줄.

**Option B — 보강 없이 weekly 만 유지**:
- 사고 발생 시 최대 7일 지연. 점진 도입 (4주) 시 사고 누적 가능성 ↑.
- **권장하지 않음** — 첫 1주가 가장 위험.

### 4.3 자동 rollback 트리거

- weekly-ops 의 무작위 샘플 5건 중 사장님이 reject ≥ 1건 → 즉시 환경변수로 직전 임계 복구.
- 30일 누적 reject 비율 ≥ 5% → 0.95 로 즉시 rollback (코드 또는 환경변수).

## 5. 모니터링 KPI

매주 weekly-ops 이메일에 추가 (이미 일부 포함):

| KPI | 산출 | 임계 |
|---|---|---|
| 자동 confirm 7d | `admin_actions WHERE action='dedupe_auto_confirm'` | 추세 비교 |
| 사장님 reject 7d | `admin_actions WHERE action='dedupe_reject'` | ≤ 5% (대비 자동 confirm) |
| pending review (검수 대기) | `welfare/loan WHERE duplicate_of_id NOT NULL AND auto NULL` | 사장님 부담 측정 |
| news 24h 미분류 backlog | `news_posts WHERE classified_at IS NULL AND created_at < now() - 24h` | < 50건 |
| news 자동 hide 비율 | `news_auto_hide / classified` | 30%~50% 정상 (네이버 RSS 광고 특성) |

## 6. 롤백 절차

### 6.1 dedupe (점진 4주 동안)

**즉시 rollback (1분)**:
- Vercel 환경변수 `DEDUPE_AUTO_CONFIRM_THRESHOLD` 값 변경 (예: 0.85 → 0.95).
- 코드 deploy 없이 다음 cron 부터 적용.

**구현 권장**:
- 현재 코드는 hardcoded `const AUTO_CONFIRM_SCORE_THRESHOLD = 0.95` 라 환경변수 미사용.
- 변경 사항: `const AUTO_CONFIRM_SCORE_THRESHOLD = Number(process.env.DEDUPE_AUTO_CONFIRM_THRESHOLD ?? 0.95)`.
- 이 한 줄 변경이 본 spec 의 유일한 운영 코드 변경 (env toggle + 점진 적용 가능).

### 6.2 news cap 확대 (별 작업)

- `app/api/cron/news-classify/route.ts:26` — `const CAP_PER_CRON = 30` → 100.
- 비용 ↑ 만 위험. 1줄 변경 + commit revert 로 즉시 복귀.

### 6.3 잘못 자동 confirm 된 row 복구

- `dedupe_auto_confirmed_at = NULL` UPDATE → 사장님 검수 큐 재진입.
- 또는 `duplicate_of_id = NULL` UPDATE → 매칭 자체 해제.
- 사장님이 `/admin/dedupe` reject 버튼으로 1클릭 가능 (이미 구현됨).

## 7. 사장님 명시 승인 받을 사항 체크리스트

본 spec 코드 변경 0. 아래 항목별로 사장님 명시 승인 후에만 진행.

- [ ] **A1: dedupe 임계 환경변수화** — `lib/dedupe` 또는 `app/api/dedupe-detect` 코드 1줄 변경 (`AUTO_CONFIRM_SCORE_THRESHOLD = Number(process.env.DEDUPE_AUTO_CONFIRM_THRESHOLD ?? 0.95)`). 위험 0.
- [ ] **A2: 점진 도입 4주** — W1 0.92 → W2 0.88 → W3 0.86 → W4 0.85. 매주 사장님 weekly-ops 이메일 sample 5건 확인.
- [ ] **A3: daily 무작위 샘플 1건 추가** — daily-digest SMS 또는 이메일에 자동 confirm 무작위 1건 추가 (보강 안전망).
- [ ] **B1: news cap 30 → 100 확대** — 비용 월 ~$19 추가. backlog 269건/일 → 50건/일 이하.
- [ ] **B2: news 임계 0.7 유지** — 임계 낮춤 미진행. backlog 는 cap 으로 해결.
- [ ] **C1: welfare LLM 매칭 — 본 spec 범위 제외** — 별 sub-project 로 분리. 본 spec 종료 후 사장님 결정 시 새 spec 작성.

**최소 1주 단위 체크포인트**:
- W1 종료 시 사장님이 W2 진행 명시 승인 필요.
- 매주 reject 비율 확인 후 다음 단계 진행 결정.

## 8. 다음 단계 제안

1. 본 spec 사장님 review → 승인 항목 결정 (A1·A2·A3·B1 권장 / B2 유지 / C1 별도).
2. **Step 1 (즉시)**: A1 환경변수화 + B1 cap 확대 1 commit (위험 0). 코드 변경 ~5줄.
3. **Step 2 (W1)**: 환경변수 0.92 적용 + weekly-ops 모니터링.
4. **Step 3~5 (W2~W4)**: 매주 사장님 승인 후 다음 임계로 점진 인하.
5. **Step 6 (W5)**: 4주 누적 데이터로 0.85 정착 또는 rollback 결정.

## 9. 위험 요약

- **데이터 부족 위험 (中)**: 30일간 자동 confirm 0건이라 0.85~0.95 영역 정밀도 측정 불가. 점진 도입 + daily 샘플로 보강.
- **사용자 노출 누락 위험 (中)**: false positive 시 사용자가 정책을 못 봄. 안전망 + rollback 절차로 완화.
- **비용 증가 위험 (低)**: news cap 확대로 월 ~$19 추가. AdSense 수익 대비 무시 가능.
- **사장님 모니터링 부담 (低)**: 4주 동안 weekly-ops 이메일 한 번씩 + (옵션) daily 샘플 1건. 어드민 진입 빈도는 그대로.

## 10. 결정·트레이드오프 메모

- **prod 데이터로 가설 반박**: spec 작성 전 가설은 "0.95 가 너무 보수적이라 사장님 부담 큼". 그러나 데이터는 "사장님 부담 0건" 을 보여줌 → ROI 재평가 필요.
- **news cap 이 dedupe 임계보다 ROI 큼**: 사장님 부담 (24h backlog 269건) 직접 영향. 임계 낮춤은 측정 불가 영역.
- **welfare LLM 분리**: 마스터 spec 의 "welfare 자동 검증" 한 줄을 본 spec 에 포함하면 범위 폭증. 별 spec 으로 분리해 하나씩 신중하게.
- **환경변수 toggle 채택**: prod DDL 0 + commit revert 0 + Vercel env 변경 1분 → 가장 안전한 운영 모델.
