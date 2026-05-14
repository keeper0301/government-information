# health-alert 단일화 정책 (suppression policy)

**목적**: 같은 사고의 결과인 여러 임계치가 동시에 발화해 SMS/텔레그램 본문 noise 가 폭주하지 않도록, 상위 사고를 우선 잡고 그 결과 alert 는 suppress 한다.

**원칙**: 임계치는 사고의 *원인* 별로 분리하되, 발화 시 *결과* 임계는 단일화로 1통 압축한다.

---

## 현재 단일화 관계 (2026-05-14)

| 발화 시 우선 alert | suppress 대상 | 가드 위치 | 사유 |
|---|---|---|---|
| `press_no_show` (press cron 노쇼) | `policy_inflow_zero` | `lib/health-check.ts` `checkThresholds()` 안 `policy_inflow_zero` 분기의 `pressNoShowFiring` 가드 | press cron 노쇼면 정책 inflow 0 은 같은 사고의 결과 |
| `policy_inflow_zero` (welfare+loan 합산 0) | `loan_inflow_zero` | `lib/health-check.ts` `checkThresholds()` 안 `loan_inflow_zero` 분기의 `welfareInflow24h >= 1` 가드 | welfare 도 0 이면 합산 사고가 우선 |
| `solapi_balance_low` (잔액 부족) | `kakao_high_failure` | `lib/external-console/kakao.ts` `checkKakao()` 안 `solapi_balance_low` push 직전 `filter((a) => a.key !== "kakao_high_failure")` | 잔액 0 → 모든 발송 실패. 잔액 alert 가 진단 출발점 |

> **함수명+key 인용 사용 이유**: 라인 번호는 stale 위험 (commit 마다 변동). 함수명·alert key 는 grep 1번으로 확정. 미래 작업자가 docs vs 코드 sync 검증 빠름.

---

## 의도적 공존 (단일화 안 함)

| alert A | alert B | 사유 |
|---|---|---|
| `loan_inflow_zero` | `press_no_show` | 다른 cron (press-ingest vs collect.yml), 다른 진단 layer (광역 보도자료 vs loan 출처) |
| `delivery_fail` | `kakao_high_failure` | `delivery_fail` = alert_deliveries DB 누적 (사용자별 program 알림), `kakao_high_failure` = Solapi 외부 API 통계. 다른 layer |
| `collect_no_show` | `loan_inflow_zero` | 같은 사고 (collect.yml 노쇼) 의 두 view. SMS 2건 = 진단 가속에 도움 |

---

## 미래 신규 임계치 추가 시 mental model

1. **새 임계 등록 전 자문**: "이 사고의 *원인* 이 기존 다른 임계치와 같은가?"
   - YES: 기존 임계로 통합 (새 key 추가 X) 또는 단일화 가드 추가 (이 표 업데이트)
   - NO: 그대로 추가, 의도적 공존이라면 표 하단에 명시

2. **suppress 가드 위치**: alert 발화 함수 (`checkThresholds()` 또는 `checkXxx()`) 안에 명시적 if 분기. 호출자가 후처리하지 않음.
   - 예: `if (lowerPriorityCondition && !higherPriorityFiring) push lower`

3. **공존 결정 시 주석 1줄**: 코드 + 이 표 양쪽 업데이트. "왜 공존인가" 1줄 — 다른 cron / 다른 layer / 다른 진단 출발점 등.

4. **코드 일관성 체크**:
   - `lib/health-check.ts:checkThresholds()` 의 가드 패턴 (예: `pressNoShowFiring && skip`) 따름
   - `lib/external-console/kakao.ts:checkKakao()` 의 단일화 (filter + push) 따름

---

## 단일화 가드의 위험

- **누적 위험**: 가드가 흩어져 있어 미래 4-5쌍 누적 시 mental model 무너짐. 이 docs 가 single source of truth.
- **silent suppress**: 우선 alert 가 cooldown 으로 suppress 됐을 때 결과 alert 도 같이 suppress 되면 사장님 인지 0. cooldown filter 가 우선 alert 만 본다면 결과 alert 는 별도 발화 가능 — 현재 cooldown 은 alert key 별이라 안전.
- **리뷰 게이트**: 새 단일화 추가 시 이 docs 업데이트 필수. 안 되면 후속 세션이 추적 불가능.

---

## 변경 이력

- 2026-05-14: 초기 작성 (3쌍). subagent code review Improvement-3 follow-up.
