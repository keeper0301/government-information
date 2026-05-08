# LLM apply_url 추출률 개선 설계

작성일: 2026-05-08
연관 이전 작업:
- `2026-04-29-regional-press-auto-ingest.md` (광역 보도자료 자동 ingest 도입)
- `2026-05-06-press-ingest-auto-drain-design.md` (cron 3회·동적 cap)
- 메모리 `project_press_ingest_auto_confirm_2026_05_08.md` (4 layer apply_url fallback chain)

## 1. 배경

오늘 (2026-05-08) push 한 4 layer apply_url fallback chain 을 prod pending 후보에 시뮬레이션한 결과:

| Layer | 회수 | 비율 |
|---|---|---|
| Layer 1 (LLM apply_url 직접 추출) | 2 / 72 | **3%** |
| Layer 2 (LLM body_urls 화이트리스트) | 0 / 72 | 0% |
| Layer 3 (본문 정규식 화이트리스트) | 0 / 72 | 0% |
| Layer 4 (광역 도청 메인 매핑) | 70 / 72 | **97%** |

자동 confirm 100% 활성화는 성공했지만 **97%가 광역 도청 메인 페이지로 fallback**. 사용자가 도청 메인 진입 → 본인이 정책 검색해야 해서 신청 funnel 마찰이 큼. 근본 원인은 LLM 이 본문에서 신청 url 또는 정책 안내 url 을 거의 추출하지 못함.

### 1.1 추출 실패 사유 추정 (사전 가설)

1. **보도자료 본문에 url 자체가 없음** — 광역도청 보도자료는 종종 "○○ 도청에 문의" 만 있고 url 미기재
2. **LLM 보수적 응답** — prompt 의 "없으면 null" 안내가 강하게 작용해 url 후보 있어도 null 반환
3. **본문 4000자 cap 잘림** — 신청 안내 섹션이 본문 후반부에 있을 경우 잘려서 LLM 이 못 봄
4. **few-shot 예시 부재** — 어떤 url 이 "정책 안내 페이지" 인지 LLM 이 판단할 기준이 prompt 에 없음
5. **body_urls 도 0건** — body 자체에 http url 이 없거나, 분류 시점에 body 가 비어있음 (collector 단계 미수집)

### 1.2 prod 데이터 확인 필요 (사장님 직접 실행)

본 spec 은 prod 직접 조회 권한이 거부되어 가설 기반으로 작성. 사장님이 다음 스크립트 실행 후 결과를 spec 에 첨부하면 옵션 결정이 더 정확해짐:

```bash
bun --env-file=.env.local scripts/analyze-llm-extraction.ts
```

위 스크립트는 다음을 출력 (코드: `scripts/analyze-llm-extraction.ts`):
- 7일 LLM apply_url 추출률 (% — 3%가 prod 에도 동일한지 검증)
- news_posts.body 길이 분포 (4000자 cap 영향: > 4000자 비율)
- pending 후보 8건 sample (ministry / title / llm apply_url / body_urls / 정규식 url)

이 데이터가 있어야 옵션 C (본문 fetch) 가 의미 있는지 판단 가능 (본문에 url 자체가 0건이면 C 는 효과 없음).

## 2. 목표

1. **Layer 1 (LLM 직접 추출) 비율 3% → 30% 이상**
2. **광역 메인 fallback 의존도 97% → 70% 이하** (직접 신청 / 정책 안내 페이지 비율 ↑)
3. **사용자 신청 funnel 단축**: 도청 메인 진입 → 검색 단계 제거
4. **비용 증가 < 30%** (Haiku 토큰 비용 통제)

### 비목표

- Layer 2~3 fallback chain 자체 변경 (이미 잘 동작)
- 광역 매핑 17개 도청 url (Layer 4) 자체 변경
- LLM 모델 교체 (Haiku 4.5 유지)
- 자동 confirm 임계 변경 (`AUTO_CONFIRM_CAP=50` 유지)

## 3. 개선 후보 3 안

### 옵션 A — prompt 강화 (1~2시간)

**핵심 변경**

1. **few-shot 예시 추가** (1~2건)
   - 광역 도청 보도자료 발췌 본문 + ideal apply_url 추출 결과 1건
   - apply_url null 이지만 body_urls 에 도청 sub-page 가 들어간 ideal 결과 1건

2. **추출 규칙 1순위 재정의**
   - 현재: "신청 바로가기" / "접수" 1순위
   - 변경: "공식 보도자료 본문에 등장한 *.go.kr / *.gov.kr URL 중 신청·정책·사업·공고 의미를 가진 것 1순위"
   - "url 못 찾으면 null" → "본문 url 후보 모두 살펴보고 가장 신청 페이지에 가까운 것 선택, 진짜 없으면 null"

3. **본문 cap 4000 → 6000자**
   - Haiku 토큰: input 4000자 ≈ 1300 tok → 6000자 ≈ 2000 tok
   - 1건당 비용: $0.003 → $0.0036 (~+20%)
   - 월 cron 90건 × 30일 = 2,700건 기준: $8.1/월 → $9.7/월 (+ $1.6/월)

**구현**: `lib/press-ingest/classify.ts` 의 `PROMPT_TEMPLATE` 보강 + `MAX_BODY_CHARS=6000`. 코드 변경 ~30줄.

**효과 추정** (low confidence — 데이터 검증 전):
- few-shot 예시로 LLM 보수적 null 응답 ↓ → Layer 1 비율 3% → 15~25%
- 본문 cap ↑ 로 본문 후반 url 회수 → 추가 5~10%p
- 합산 추정 **Layer 1 20~35%**

**위험**: few-shot 예시가 잘못된 url 을 강요해 false positive 신청 url 발생 가능 → 사용자 신뢰도 ↓. 사장님 confirm 단계에서 가드 가능.

### 옵션 B — 광역별 sub-path 매핑 정밀화 (2~3시간)

**핵심 변경**

`PROVINCE_DEFAULT_URLS` 를 단일 url → `(category × ministry) → url` 정밀 매핑으로 확장.

```ts
// 현재: 단순 매핑
"서울특별시": "https://www.seoul.go.kr"

// 변경: category × 광역 매트릭스
"서울특별시": {
  default: "https://www.seoul.go.kr",
  welfare: {
    default: "https://wis.seoul.go.kr",
    "양육": "https://wis.seoul.go.kr/main/yook",
    "주거": "https://housing.seoul.go.kr",
    "취업": "https://job.seoul.go.kr",
  },
  loan: {
    default: "https://www.sbiz.or.kr",  // 서울신용보증재단
    "창업자금": "https://www.sbiz.or.kr/youthstart",
  },
}
```

17 광역 × welfare 8 카테고리 + loan 7 카테고리 = ~60건 매핑.

**구현**:
- `province-default-urls.ts` 자료구조 변경 (호환성 위해 string 또는 object 둘 다 허용)
- `resolveProvinceFallback` 시그니처 확장 (category, program_type 인자 추가)
- 17 도청 사이트 IA (Information Architecture) 수동 조사 — 가장 시간 소요 (1~2시간)

**효과 추정**:
- Layer 4 의 *질* 향상 (메인 페이지 → 카테고리 페이지)
- Layer 1 비율 자체는 변화 없음 (LLM 추출률 동일)
- 사용자 funnel 마찰은 ↓ (도청 메인 → welfare/노인 카테고리 페이지)
- 메모리 KPI: Layer 1 비율 **그대로 3%**, 단 Layer 4 의 평균 click depth ↓

**위험**:
- 60건 매핑 중 도청이 url 변경 시 dead link → 사용자 404 경험
- 카테고리 매핑 누락 시 자동 fallback 으로 default 광역 메인 (안전)
- 정기 점검 (3개월/회) 운영 부담

### 옵션 C — 본문 fetch 후 url 추출 enhancement (3~4시간)

**핵심 변경**

LLM 분류 후 `body_urls` 또는 본문 정규식 url 들 (광역 도청 sub-page) 을 추가로 fetch 해서 *그 페이지에서* 신청 페이지 url 을 추출.

```
보도자료 본문 → www.gg.go.kr/policy/123 (sub-page url)
                ↓ fetch
                정책 상세 페이지 → "신청하기" 버튼 url 추출
                                  ↓
                                  최종 apply_url
```

**구현**:
- `lib/press-ingest/url-deep-fetch.ts` 신규 모듈 (~150줄)
- 도청 sub-page HTML fetch (timeout 5초, robots.txt 미준수 위험)
- "신청" / "접수" / "지원신청" anchor href 추출 (cheerio 또는 정규식)
- ingest cron 에 추가 step (cron 시간 ↑)
- 비용: cron 당 추가 fetch 30~50회 × 1초 = 30~50초 → maxDuration 300초 안 (안전)

**효과 추정**:
- 본문에 sub-page url 이 있을 때만 동작 (= Layer 2/3 가 0/72 인 현 상황에서는 거의 무력)
- prod 데이터 없으면 효과 추정 불가 — 사장님 검증 스크립트 결과 필요

**위험**:
- robots.txt / 도청 사이트 부하 / 차단
- HTML 파싱 깨짐 (도청 사이트 IA 자주 변경)
- 비용·복잡도·운영 부담 ↑↑

## 4. 비교 매트릭스

| 항목 | A (prompt) | B (sub-path 매핑) | C (deep fetch) |
|---|---|---|---|
| 효과 (Layer 1 추출률 ↑) | **+15~25%p** | 0 | 0~5%p |
| 효과 (사용자 funnel 마찰 ↓) | 中 | **大** | 中 |
| 구현 시간 | 1~2h | 2~3h | 3~4h |
| 토큰/cron 비용 변화 | +20% | 0 | +10~30% |
| 운영 부담 | 낮음 | **높음 (3개월/회 점검)** | 중 |
| 위험 | false positive url | dead link 404 | 도청 부하·차단 |
| 롤백 난이도 | 매우 쉬움 (prompt revert) | 쉬움 (자료구조 revert) | 중 (모듈 disable) |

## 5. 추천 1순위 — 옵션 A (prompt 강화)

### 이유

1. **현재 병목이 LLM 추출률 자체** (3%) — A 가 직접 해결
2. **구현·롤백 가장 빠름** — prompt + cap 변경, 코드 ~30줄, revert 1 commit
3. **비용 증가 통제 가능** — +$1.6/월 수준
4. **A 의 효과 측정 후 B/C 결정 가능** — 데이터 기반 의사결정

### 단계 (옵션 A 진행 시)

1. (사장님) `scripts/analyze-llm-extraction.ts` 실행 → prod 7일 추출률·body 길이·sample 8건 확인
2. sample 8건 중 1~2건을 골라 ideal 추출 결과를 사람이 직접 작성 → few-shot 예시
3. `classify.ts` PROMPT_TEMPLATE 보강 + `MAX_BODY_CHARS=6000`
4. `bun test` 통과 (`lib/press-ingest/__tests__/classify.test.ts` 가 있으면 보강)
5. push → 다음 cron (KST 10:30/15:30/19:30) 후 1일 모니터링
6. 1주 후 KPI 추세 보고 (Layer 1 비율 추세)

### 옵션 B 보류 사유

A 시행 후 Layer 1 비율이 충분히 (목표 30%+) 올라가면 Layer 4 의존도가 자연 감소 → B 의 ROI 가 떨어짐. A 가 기대보다 약하면 (Layer 1 < 15%) B 추가 시행 검토.

### 옵션 C 보류 사유

본문에 sub-page url 자체가 없으면 (Layer 2/3 가 0/72 에서 시사) C 의 효과 0. 비용·복잡도 대비 효과 불확실. A·B 시행 후에도 부족하면 마지막 카드.

## 6. 모니터링 KPI

옵션 A 시행 후 다음 KPI 를 매일 / 매주 추세 확인:

1. **Layer 1 (LLM apply_url) 비율 (목표 3% → 30%+)**
   - 측정: 7일 press_ingest_candidates 중 classified_payload.apply_url not null 비율
   - 위치: `scripts/analyze-llm-extraction.ts` 또는 `/admin/press-ingest` 페이지에 추가

2. **광역 매핑 fallback 의존도 (목표 97% → 70% 이하)**
   - 측정: auto_confirm 시 layer breakdown (`autoConfirmPendingPressCandidates` 가 이미 logging)
   - 위치: admin_actions log 또는 daily-digest

3. **자동 confirm 률** (이미 측정 중, 회귀 안 하는지 확인)
   - 측정: 7일 press_ingest_candidates 중 status=confirmed 비율
   - 회귀 시그널: A 시행 후 false positive 가 늘어 사장님 reject 비율 ↑

4. **사용자 신청 페이지 진입 → 신청 완료 funnel** (가능하면 — GA4 또는 토스 이벤트)
   - 우선순위 낮음, A·B·C 효과 검증의 ground truth

## 7. 롤백 절차

### 옵션 A 롤백
```bash
git revert <prompt 강화 commit>
git push origin master
# 다음 cron (KST 10:30/15:30/19:30) 부터 이전 prompt 동작
```
- 영향 범위: 새로 들어오는 cron 분류만. 기존 confirmed 후보는 그대로.
- DDL 변경 없음 → 즉시 안전 롤백.

### 옵션 B 롤백 (시행했을 시)
```bash
git revert <sub-path 매핑 commit>
git push origin master
```
- `province-default-urls.ts` 자료구조 단순 string 으로 복원
- `resolveProvinceFallback` 시그니처 복원
- DDL 변경 없음.

### 옵션 C 롤백 (시행했을 시)
- `url-deep-fetch.ts` 모듈 disable (env flag `PRESS_DEEP_FETCH_ENABLED=false`) 또는 import 제거
- ingest 흐름에서 deep-fetch step skip
- 도청 사이트 부하 즉시 0

## 8. 사장님 결정 사항

다음 중 하나 선택:

- **[A]** prompt 강화 1순위 (추천) — 1~2시간, 비용 +20%, 즉시 시행
- **[A → B]** A 먼저 1주 모니터링 후 B 추가 결정
- **[B 단독]** Layer 1 추출률 포기, 사용자 funnel 마찰만 줄이기
- **[C 단독]** 본문 fetch 도전 (prod sample 검증 후 결정)
- **[보류]** 4 layer fallback 충분 (현 97% Layer 4 그대로)

기본값: 사장님 별도 지시 없으면 **A** 진행 (별도 spec 검토 PR 후 코드 변경).

## 9. 참조 파일

- `lib/press-ingest/classify.ts` — LLM prompt + MAX_BODY_CHARS
- `lib/press-ingest/url-fallback.ts` — 4 layer fallback chain
- `lib/press-ingest/province-default-urls.ts` — 광역 17 매핑
- `lib/press-ingest/ingest.ts` — cron 진입점 + AUTO_CONFIRM_CAP
- `scripts/analyze-llm-extraction.ts` — 추출률 분석 (신규, 본 spec 같이 추가)
- `scripts/diagnose-press-ingest.ts` — 4 layer 시뮬레이션 (기존)
