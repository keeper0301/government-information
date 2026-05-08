# 추천 시스템 옵션 D — Architecture 재검토 설계

작성일: 2026-05-08
컨텍스트: 옵션 B (cohort gate 재설계) 1단계 종료 직후. 진단 도구 (commit `766d99f`·`290587a`) + snapshot framework (commit `8b1039a`) 가 갖춰진 상태에서 진행하는 **architecture 단계 재검토**.

> 이 문서는 코드 변경을 동반하지 않습니다. 사장님이 다음 큰 작업 (PoC) 진입 전에 어떤 방향이 가장 안전하고 효과 큰지 결정하시기 위한 비교 자료입니다.

## 0. 한 장 요약

- 현재 추천은 "정규식 + 가산점 합계 + 게이트" 단방향 룰 엔진. 2주간 45 commit, 16 cohort 정규식, 9 게이트 누적 (옵션 B 진단으로 큰 가설 1건 반박, 정밀 fix 1건만 적용).
- 옵션 B 1단계 측정으로 **장애인·노년·기초수급·보훈 4 cohort 는 false positive 거의 없음** 이 확인됨 → architecture 재설계 동기는 "false positive 폭발" 이 아니라 **"개선 천장 도달"** 쪽으로 이동.
- 본 문서는 다음 도약을 위한 4가지 architecture 후보 (LLM 매칭 / 임베딩 / 하이브리드 / 학습형) 를 비교하고, **추천 1순위는 C — 하이브리드 (현행 룰 + 임베딩 rerank)** 로 제시.
- 결정은 사장님 몫. 진입 전 1단계로 "현재 baseline 정량 측정 (페르소나 5 × 4 영역) + 사용자 클릭 로깅 활성화" 부터 권고.

## 1. 현재 추천 architecture 정리 (As-Is, 2026-05-08 기준)

### 1.1 전체 그림

```
[사용자 프로필]                       [정책 풀]
profiles + eligibility_profiles          welfare_programs (~6,000)
+ business_profiles                      loan_programs    (~5,500)
        │                                news_posts·blog_posts
        ▼ buildRecommendUserSignals
   UserSignals
   (lib/personalization/types.ts)
        │
        ▼  pool fetch (limit 100~300, 마감 필터, source_code 제외)
        │
        ▼  scoreProgram()  ← per-policy
        │   ├ ⓪ Cohort 게이트 (16 종 정규식)
        │   ├ ① Income 게이트
        │   ├ ② Region 게이트 (별칭 + district_mismatch + title 충돌)
        │   ├ ③ 본문 충돌 키워드 (다른 광역 시군구)
        │   ├ ④ Benefit tags 교집합 (+3/태그)
        │   ├ ⑤ 직업 키워드     (+2)
        │   ├ ⑥ 연령 키워드     (+1)
        │   ├ ⑦ Income 매칭     (+4 정확 / +2 폴백)
        │   ├ ⑧ Household 매칭  (+3/태그, mismatch 강제 0)
        │   ├ ⑨ Business 매칭   (+5 / mismatch 강제 0)
        │   └ ⑩ 마감 임박 tiebreaker (+1)
        ▼
   scoreAndFilter (minScore=6, blog=3) → 정렬 → limit
        │
        ▼
   /recommend, /, 마이페이지, 알림 dispatch
```

### 1.2 핵심 입력·출력

| 구성요소 | 위치 | 입력 | 출력 |
|---|---|---|---|
| `UserSignals` | `lib/personalization/types.ts` | profile DB | ageGroup, region, district, occupation, incomeLevel, householdTypes[], benefitTags[], hasChildren, merit, businessProfile |
| `ScorableItem` | `lib/personalization/score.ts` | 정책 row | id, title, target, description, eligibility, region, benefit_tags, apply_end, income_target_level, household_target_tags |
| `scoreProgram(item, user)` | `lib/personalization/score.ts:695` | ScorableItem + UserSignals | `{ item, score, signals[] }` (score 0 또는 1~수십) |
| `scoreAndFilter` | `lib/personalization/filter.ts` | items[] + UserSignals + `{ minScore, limit }` | sorted ScoredItem[] |
| `getRecommendations` | `lib/recommend.ts:262` | `RecommendParams` | `DisplayProgram[]` (최대 limit) |
| `PERSONAL_SECTION_MIN_SCORE` | `types.ts:50` | — | 6 (welfare/loan/news), blog=3 별도 |

### 1.3 Personalization 단계 (Phase 1 / 1.5)

- **Phase 1** (마이그레이션 038~042): age/region/occupation/incomeLevel/householdTypes/benefitTags 기반 룰 매칭. 본문 키워드 폴백 가산점 (+2).
- **Phase 1.5** (마이그레이션 043): 정책 본문에서 `extractTargeting` 으로 `income_target_level`·`household_target_tags` 컬럼 자동 추출 (welfare/loan 11,755건 백필 완료). 정확 매칭 시 +4 / +3 가산.
- 자영업자 wedge (마이그레이션 055): `business_profiles` + `evaluateBusinessMatch` 정규식 매칭. mismatch 강제 0.
- 보훈 (마이그레이션 064) / 자녀 유무 / 농어민 직업 등 후속 시그널 점진 추가.

### 1.4 디버깅 도구 (옵션 D 1·2번째 spec)

- **`/admin/recommendation-trace`** (commit `766d99f`·`290587a`): 사장님 본인 + 페르소나 6 × 4 영역 (welfare/loan/news/blog) trace. 각 정책의 차단 사유 (`shown` / `below_min_score` / `cohort_mismatch` / `regional_gate` / `household_gate` / `business_mismatch` / `income_gate` / `no_signal`) + 점수 분포 4 bucket + cohort 16종별 카운트.
- **`__tests__/personalization/snapshot.test.ts`** (commit `8b1039a`): fixture 18 × 페르소나 5 = 90 케이스 vitest snapshot. score.ts 변경 시 자동 fail.
- **활용 흐름**: 사장님이 진단 페이지에서 페르소나 선택 → 차단 분포 확인 → false positive 의심 cohort 펼침 발췌 5건 검증 → 정밀 fix → snapshot 재기록 → 다른 페르소나 회귀 0 확인.

## 2. 현재 한계 — 왜 옵션 D 가 필요한가

### 2.1 옵션 B 데이터로 반박된 큰 가설

옵션 B 1단계 (commit `290587a`·`b96b39d`) 측정 결과 (memory `project_recommendation_option_b_2026_05_06`):

| Cohort | 차단 합계 | 발췌 검증 |
|---|---|---|
| 장애인 | 139건 | 5/5 진짜 장애인 정책 (true positive) |
| 노년 | 97건 | 5/5 진짜 노인 정책 |
| 기초수급 | 94건 | 4/5 진짜 저소득 정책 |
| 보훈 | 52건 | 3/5 진짜 보훈 정책 |
| **근로자** | **48건** | **2/5 만 진짜 → 부분 false positive** |

당초 가설 "16개 cohort 정규식 모두 false positive 큼 → LLM 분류 백필 11,755건 필요" 는 **데이터로 반박**. 근로자 정밀화 외엔 추가 ROI 낮음.

→ Architecture 재검토 동기는 "정규식 폭발" 이 아니라 **"개선 천장"**.

### 2.2 천장에 가까워졌다는 신호

옵션 B 측정 결과 (페르소나별 4 영역 노출):

- p2 (30대 서울 직장인 신혼): **shown=0** / cohort 9 / regional 4 ← 정상 추천 0건
- p3 (60대 부산 농어민): shown=0 → 11 (옵션 B로 +) / cohort 6 / below_min 8
- p4 (20대 대학생 single): shown=3
- p5 (40대 한부모 다자녀): shown=6
- p6 (50대 장애가구 보훈): shown=3

p3 가 옵션 B 로 5→11 로 증가는 했지만, **p2 같은 흔한 페르소나가 추천 0건** 인 것은 게이트가 아니라 "신호 조합 점수가 minScore 6 을 못 넘는다" 는 구조 한계. minScore 8→6 하향 (commit `8046733`) 했음에도 동일 양상.

### 2.3 cohort 추가만의 한계 — 정성 매칭 부족

현재 점수 계산은 *어휘 일치* 기반:

- "20대 + 대학생 + 주거" 정책 본문에 "청년" 단어가 없으면 0점.
- "직장인 + 양육 + 신혼" 인 사용자에게 "맞벌이 아이돌봄 시간제" 같이 의미 일치 정책이 본문에 정확 키워드 없을 시 차단.
- 정책 본문이 짧거나 (`description` 1~2문장만) `eligibility` NULL 이면 매칭 신호 0.

정성적 의미가 일치하는데 *어휘 부재* 로 못 잡는 false negative 가 천장의 본질.

### 2.4 왜 *지금* 재검토인가

- 옵션 B 가 큰 가설 닫음 → 다음 한 단계 도약 전엔 architecture 비교 필요.
- 진단 도구 + snapshot baseline 갖춰져서 비교 측정 가능 (옵션 D 의 1·2번째 spec).
- 사용자 데이터 (정책 클릭·신청 클릭) 가 아직 적게 쌓임 → 학습형 (옵션 D-④) 진입 시점 결정에도 데이터 측정 필요.

## 3. 옵션 D 후보 architecture (4 안)

각 안은 **현재 시스템과의 결합 방식** 까지 명시. score.ts 룰 엔진을 완전 대체하는 안은 회귀 위험이 너무 커서 제외.

### 안 A — LLM 매칭 (사용자 ↔ 정책 본문 LLM scoring)

- **방식**: 추천 시점에 사용자 프로필 요약 + 후보 정책 본문 N건 (예: 50) 을 Claude Haiku 등 가벼운 LLM 에 보내 `score: 0~10 + reason` JSON 반환.
- **결합**: 현재 `scoreAndFilter` 통과한 상위 30건을 LLM 으로 rerank, 또는 minScore 미달 풀 (below_min_score 부분) 만 LLM 재평가.
- **장점**: 의미 일치 매칭 가능 (정성 false negative 해소). reason 텍스트로 사용자에게 "왜 추천?" 표시 가능 (UX 보너스).
- **단점**:
  - **비용**: Haiku 1,000 토큰 in/out 기준 사용자 1명 추천 1회 ≈ 30~50개 정책 평가 → 약 ₩50~80/회. 사용자 10,000명 × 일 1회 → 월 ₩15M~24M. *기존 키워드 비용 0 대비 폭증.*
  - **latency**: SSR 초기 렌더에 LLM 호출 추가 → 페이지 응답 +3~8초.
  - **keepio_agent 중복**: memory `project_keepioo_phase3_data_quality` 의 B2 LLM 가이드 제외 사유 (LLM 분류는 keepio_agent 가 이미 정책 등록 시 분류). 추천 시점 LLM 매칭은 *별도 책무* 라 중복은 아니지만, 관리 복잡도 증가.
- **확장성**: 사용자 증가 = LLM 호출 비용 선형 증가. 1만 사용자 한계.

### 안 B — 임베딩 기반 (Vector search, supabase pgvector)

- **방식**: 사전 작업으로 정책 본문 11,500건 + 사용자 프로필 텍스트화 → OpenAI embedding (text-embedding-3-small, 1536d) → `welfare_programs.embedding`·`profiles.embedding` 컬럼 저장. 추천 시 cosine similarity top-N 후보 추출.
- **결합**: pgvector 가 1차 후보 100건 추출 → 현재 `scoreProgram` 게이트 통과한 것만 → minScore 정렬. 룰 엔진은 **자격·지역 게이트 전용** 으로 축소.
- **장점**:
  - **비용 1회성**: 임베딩 백필 11,500건 = 약 ₩200,000 (one-time). 매일 신규 정책 추가 시 1건당 ₩5 미만.
  - **latency 우수**: pgvector HNSW index → cosine 검색 50ms 이하.
  - **의미 매칭**: 어휘 일치 한계 해소 (예: "신혼 맞벌이 아이돌봄" → "신혼부부 보육지원" 매칭).
  - **데이터 자산**: 임베딩 컬럼은 향후 검색·중복 탐지·관련 정책 추천에도 재활용.
- **단점**:
  - **infra**: Supabase pgvector 확장 (이미 enable 가능), HNSW index 디스크 +200MB 추정. NANO Disk IO Budget 사고 (memory `project_svg_map_504_incident_2026_04_26`) 고려 시 MICRO 이상 필수.
  - **자격 매칭 못 함**: "장애인 가구 전용 정책" 도 의미 유사도가 높으면 일반 사용자에게 추천될 위험. → cohort 게이트 + household 게이트는 **반드시 유지** 해야 함.
  - **사용자 프로필 텍스트화 품질**: 이 부분이 정밀도 결정. "30대 서울 직장인 신혼" → 좋은 텍스트 표현 필요.
- **확장성**: 사용자·정책 증가에 비용 거의 무관. 가장 좋음.

### 안 C — 하이브리드 (룰 + 임베딩 + LLM rerank top-N)

- **방식**: 3 단계 파이프라인.
  1. 룰 엔진 (현재 score.ts) 으로 자격·지역·cohort 게이트 통과한 후보 추출 (~50건).
  2. 임베딩 cosine 으로 사용자 프로필과 의미 유사도 score 계산 → 상위 20건.
  3. LLM (Haiku) 으로 상위 20건 rerank + reason 생성. 최종 10건 노출.
- **결합**: 룰 엔진 = 안전 게이트, 임베딩 = 재현율, LLM = 정성 ranking.
- **장점**: 안전성 + 정밀도 + UX (reason). 옵션 B 의 1단계 (룰) 가 그대로 살아있어 회귀 위험 ↓.
- **단점**: 복잡도 가장 높음. 3 layer 디버깅. 비용 = 안 A (LLM rerank top-20) + 안 B (임베딩 1회성).
- **확장성**: 안 A 보다는 좋음 (LLM 호출 후보 20건 고정). 사용자 1만 × 일 1회 ≈ 월 ₩6M.

### 안 D — 학습형 (logistic regression / gradient boosting)

- **방식**: 사용자 클릭·"신청하기" 클릭·즐겨찾기 데이터 누적 → feature (age·region·benefit_tags 교집합·점수 분포) → label (클릭 1 / 노출 0) → LightGBM·LR 학습 → score = predicted CTR.
- **결합**: 룰 엔진으로 후보 100건 → 학습 모델 score → 정렬.
- **장점**: 실제 사용자 선호 반영. 운영 길어질수록 정밀도 향상.
- **단점**:
  - **데이터량 부족**: 현재 활성 사용자 N (마이페이지 입력 완료) ≈ 미지수 (운영 9개월). 클릭 이벤트 수도 학습 모델 신뢰 임계 (~10,000건/월) 도달 여부 불확실.
  - **콜드 스타트**: 신규 정책은 클릭 데이터 0 → score 불가능.
  - **편향**: 노출된 정책만 클릭 받아 학습. 안 보여준 정책은 영원히 안 추천.
- **확장성**: 데이터 확보 후엔 가장 좋음. 단, *지금은 진입 시기 아님*.

## 4. 비교 매트릭스

| 항목 | A. LLM 매칭 | B. 임베딩 | **C. 하이브리드** | D. 학습형 |
|---|---|---|---|---|
| 정밀도 (의미 매칭) | ★★★★ | ★★★ | ★★★★★ | ★★★★ (데이터 확보 후) |
| 자격·게이트 안전성 | ★★ (LLM 환각) | ★★★ (룰 보강 필요) | ★★★★★ | ★★★ |
| 초기 비용 (구축) | 낮음 | 중간 (임베딩 1회 ₩200K) | 중간 | 높음 (데이터 파이프라인) |
| 운영 비용 (월) | ₩15M~ (1만 유저) | ₩50K | ₩6M | ₩100K |
| Latency | 3~8초 ↑ | 50ms | 1~2초 | 100ms |
| 구현 시간 | 1주 | 2~3주 | 4~6주 | 6~8주 + 데이터 확보 대기 |
| infra 부담 | 외부 API | pgvector + MICRO+ | pgvector + LLM | feature store + 학습 잡 |
| 회귀 위험 | 중 (LLM 환각) | 중 (게이트 우회) | **저 (룰 보존)** | 중 (콜드 스타트) |
| 롤백 난이도 | 쉬움 (env 끄기) | 쉬움 (룰만 사용) | 중 (3 layer) | 어려움 (학습 데이터 의존) |
| keepio_agent 중복 | 위험 있음 | 없음 | 일부 | 없음 |
| 측정 가능성 | trace 도구 그대로 | 동일 + 임베딩 점수 추가 | 동일 + 단계별 점수 | A/B 비교 필요 |

## 5. 추천 1순위 — **안 C (하이브리드)** + 단계 도입

### 이유

1. **현재 룰 엔진을 버리지 않음** → 옵션 B 1단계 누적 데이터 (16 cohort, 9 게이트, fixture snapshot) 그대로 활용. 회귀 위험 ↓.
2. **임베딩 layer 가 천장 해소 핵심**. p2 (직장인 신혼) shown=0 같은 false negative 의 본질이 의미 매칭 부재 → 임베딩이 직접 해결.
3. **LLM rerank 는 옵션** — 비용 부담 시 임베딩까지만 (B 안) 으로 단계 진입 가능. UX (reason) 필요할 때만 LLM 추가.
4. **진단·snapshot 도구가 그대로 작동** — 룰 엔진 게이트 분류는 동일하므로 옵션 D 의 1·2번째 spec 의 측정 자산 보존.
5. **점진 도입 가능** → 1단계 임베딩만 도입 → 효과 측정 → 2단계 LLM rerank 추가 → 효과 측정. 각 단계가 독립 롤백 가능.

### 추천 1순위가 *아닌* 이유 (탈락 안 들)

- **A 단독**: 비용·latency 폭증. 회귀 위험 (LLM 환각으로 자격 미달자에게 추천).
- **B 단독**: 의미 매칭은 잘 되지만 정책 reason 표시·정밀 ranking 부재. 사용자 UX 변화 작음.
- **D 단독**: 데이터량 부족 + 콜드 스타트. 향후 6~12개월 후 재검토 권고.

## 6. 점진 도입 plan

### 0단계 — 측정 baseline 확보 (코드 변경 0, 1주)

1. **클릭 로깅 활성화 검증** — 현재 GA4 / Supabase 에 정책 카드 클릭 / "신청하기" 클릭 / 즐겨찾기 추가 이벤트가 잘 쌓이는지 확인. 누락 시 이벤트 추가 (옵션 D-④ 입력으로도 활용).
2. **현재 baseline 수치 기록**:
   - 페르소나 5 × 4 영역 의 `shown` 카운트 (snapshot 결과 기록).
   - production 활성 사용자 추천 빈 화면 비율 (`/recommend` 0건 노출률) 1주 측정.
   - 정책 카드 CTR (영역별).
3. **비용 시뮬레이션 시트** — 안 C 도입 시 월 비용 / latency / infra 영향을 사장님 1장 시트로 정리.

### 1단계 — 임베딩 PoC (안 C 의 임베딩 layer 만, 2~3주)

1. **데이터 파이프라인 PoC**:
   - Supabase pgvector 확장 enable (마이그레이션 +1).
   - `welfare_programs.embedding`·`loan_programs.embedding` vector(1536) 컬럼 추가.
   - 신규 정책만 자동 임베딩 (cron, OpenAI text-embedding-3-small).
   - 기존 11,500건 백필 (1회성, 약 ₩200K).
2. **사용자 프로필 텍스트화**:
   - `UserSignals` → "30대 서울 직장인 신혼, 주거·양육 관심" 같은 자연어 변환 함수.
   - 이 함수를 진단 도구에도 노출 (페르소나 텍스트화 결과 미리보기).
3. **shadow mode 운영**:
   - score.ts 흐름은 그대로 — 옆에서 임베딩 cosine 점수 계산만 추가.
   - 진단 도구에 "임베딩 점수" 열 추가 → 사장님이 룰 점수 vs 임베딩 점수 비교.
   - **사용자 노출은 0** (shadow only). 1주 데이터 누적.
4. **A/B 실험** (활성화 결정 후):
   - 사용자 50% 에 임베딩 + 룰 ranking, 50% 에 룰 only.
   - 1~2주 후 CTR 비교.
   - 통계적 유의 차 (>5%) 면 100% 활성.

### 2단계 — LLM rerank 추가 결정 (효과 측정 후, 1~2주)

- 1단계 결과 만족스러우면 LLM rerank 진입 / 만족 못하면 임베딩 단독 유지.
- 진입 시 top-10 후보만 LLM rerank → 비용 통제 (월 ₩1M 미만 예상).
- reason 필드를 카드 UI 에 노출 (사용자 가치 가산).

### 3단계 — 학습형 (옵션 D-④) — 6~12개월 뒤 재검토

- 클릭 이벤트 ≥ 50,000건 / 월 도달 시 PoC 검토.

## 7. 위험·롤백

### 안 C 도입 시 단계별 위험

| 단계 | 위험 | 사용자 노출 | 롤백 |
|---|---|---|---|
| 0단계 (baseline) | 0 | 0 | 코드 변경 X |
| 1단계 — 임베딩 백필 | DB IO 부담 (백필 1회) | 0 | 마이그레이션 down — column drop |
| 1단계 — shadow | 0 (shadow only) | 0 | 진단 도구의 추가 column 만 제거 |
| 1단계 — A/B | 50% 사용자 추천 정밀도 변동 | 50% | A/B flag off → 100% 룰 only |
| 1단계 — 100% | 자격 게이트 우회 시 사고 | 100% | flag off (룰 only 즉시 복귀) |
| 2단계 — LLM rerank | 비용 폭증 / latency | 100% | flag off → 임베딩 단독 |

### 안전망 (이미 갖춰진 것 + 추가)

- **이미 갖춰진**:
  - `/admin/recommendation-trace` (페르소나 5 × 4 영역 측정).
  - `__tests__/personalization/snapshot.test.ts` (score 회귀 자동 감지).
  - cohort gate 16종 + household gate + business mismatch (자격 안전망).
- **추가 권고**:
  - **임베딩 score 별도 snapshot** — 1단계 도입 시 임베딩 점수 분포 페르소나별 baseline 기록 (옵션 D-2 와 동일 패턴).
  - **A/B flag 인프라** — `lib/personalization/recommendation-mode.ts` 에 `'rule_only' | 'rule_plus_embedding' | 'rule_plus_embedding_plus_llm'` enum + 환경변수 / DB toggle. 즉시 롤백 가능 구조.
  - **자격 게이트 절대 우회 금지 룰 명문화** — 안 B/C 어떤 layer 에서도 cohort/income/household/business 게이트는 *항상 통과한 후* 만 ranking 적용. `lib/personalization/score.ts` 게이트가 진입 단계 필터.

## 8. 결정 사항 (사장님 응답 필요)

1. 추천 1순위 **안 C (하이브리드)** 동의 / 다른 안 선호 / 1순위 보류.
2. 0단계 (baseline 측정 1주) 진입 승인.
3. 1단계 임베딩 PoC 진입 시점 — 0단계 직후 / 한 분기 뒤 / 보류.
4. 임베딩 백필 비용 (약 ₩200,000 1회) + Supabase 인스턴스 MICRO → SMALL 업그레이드 (약 월 +₩30,000) 동의 여부.
5. LLM rerank (2단계) 는 1단계 효과 측정 후 별도 결정.

## 9. 다음 spec 후보 (본 architecture 채택 시)

- **옵션 D-3 / 1단계 임베딩 PoC 설계** — pgvector 마이그레이션 + 백필 cron + 사용자 프로필 텍스트화 + shadow 모드 진단 도구 통합.
- **옵션 D-4 / A/B flag 인프라** — `recommendation-mode` enum + 환경변수 + 진단 도구의 모드 비교 column.
- (보류) **옵션 D-5 / LLM rerank** — 2단계 진입 시 작성.
- (보류) **옵션 D-6 / 학습형 데이터 파이프라인** — 6~12개월 뒤.

## 10. 참고 자료

- 코드:
  - `lib/personalization/score.ts:695` `scoreProgram`
  - `lib/personalization/filter.ts` `scoreAndFilter`
  - `lib/personalization/types.ts:50` `PERSONAL_SECTION_MIN_SCORE`
  - `lib/recommend.ts:262` `getRecommendations`
  - `app/admin/recommendation-trace/trace-area.ts` `traceWelfare`/`traceLoan`/`traceNews`/`traceBlog`
  - `lib/personalization/diagnostic.ts` `traceScore`·`summarizeTrace`
  - `__tests__/personalization/snapshot.test.ts`
- 이전 spec:
  - `docs/superpowers/specs/2026-05-06-recommendation-trace-design.md`
  - `docs/superpowers/specs/2026-05-06-personalization-snapshot-design.md`
  - `docs/superpowers/specs/2026-04-25-personalization-design.md` (Phase 1)
  - `docs/superpowers/specs/2026-04-25-personalization-phase1-5-design.md` (Phase 1.5)
- 메모리:
  - `memory/project_recommendation_trace_2026_05_06.md`
  - `memory/project_recommendation_snapshot_2026_05_06.md`
  - `memory/project_recommendation_option_b_2026_05_06.md`
- 운영 데이터 (2026-05-08 기준):
  - 정책 풀: welfare ~6,000 / loan ~5,500 / news / blog
  - score.ts 누적 변경: 2주간 45 commit
  - cohort 정규식: 16종
  - 게이트: 9종 (cohort / income / region / title 충돌 / region_district / household / business / 폴백 안전 / 마감)
