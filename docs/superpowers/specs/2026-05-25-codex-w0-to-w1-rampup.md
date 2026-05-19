# Codex Phase 6 W0 → W1 ramp-up 결정 spec (2026-05-25 예상)

> **작성일**: 2026-05-18
> **결정 시점**: 2026-05-25 (W0 1주차 검증 완료)
> **관련 메모리**: [[codex-autonomous-phase6-w0-2026-05-18]]

## W0 → W1 차이

| 모드 | mutate | PR_ACTIONS | 안전망 |
|---|---|---|---|
| **W0** (현재) | 0 (read-only) | 0 (모두 admin_review or create_pr 미적용) | AGENT_DISABLED kill switch + rate limit 10/분 |
| **W1** (5/25 가능) | create_pr 만 | codex_scraper_fix / codex_ui_copy_fix / codex_prompt_tuning / codex_blog_publish_fix | + GH_AGENT_PAT 권한 keepioo repo only |

## W1 활성화 절차 (사장님 외부 액션 5분)

### Step 1 — 1주차 검증 (5/25 시점)

```sql
-- 7일 agent_diagnose_run 누적 + question diversity
SELECT
  COUNT(*) AS total,
  COUNT(DISTINCT details->>'question') AS unique_questions,
  COUNT(*) FILTER (WHERE details->>'error' IS NOT NULL) AS errors
FROM admin_actions
WHERE action = 'agent_diagnose_run'
  AND created_at >= NOW() - INTERVAL '7 days';
```

**판단 기준**:
| 지표 | 임계 | W1 GO 조건 |
|---|---|---|
| total | ≥ 800 | 30분 cycle × 48 × 10 × 7 = 약 3,360 예상, 약 24% 보수 임계 |
| unique_questions | 10 | 모든 question 정상 dispatch |
| errors | < 5% | sidecar Codex CLI / network / DB 에러 미만 |

5/18 1일차 측정: total 159 (24h), 9 unique, errors 0. 7일 누적 추정 ~ 1,100.
**임계 800 충족 가능** — 단 sidecar cycle 간격이 30분 → 82분 (실측) 으로 길어진 점 추가 진단 필요.

### Step 2 — GitHub PAT 발급 (사장님 외부 액션 3분)

1. https://github.com/settings/tokens
2. "Generate new token (classic)" 클릭
3. Name: `keepioo-codex-w1-agent`
4. Expiration: **90 days** (분기 갱신)
5. Scopes: `repo` (전체 — keepioo repo PR 생성·branch push)
6. Generate → token 즉시 복사 (사장님 패스워드 매니저 저장, 채팅 평문 입력 금지)

### Step 3 — Vercel + Render env 등록 (사장님 외부 액션 2분)

**Vercel** (keepioo prod):
- `AGENT_W1_ENABLED=true` (sensitive: false, 값 노출 OK)
- Save → Redeploy

**Render** (keepio-agent sidecar):
- `GH_AGENT_PAT=<발급 token>` (sensitive: true)
- Save → 자동 재배포

### Step 4 — 1차 W1 검증 (5/25 발동)

- sidecar 가 다음 cycle (30~82분) 후 첫 codex_scraper_fix 또는 codex_ui_copy_fix PR 생성 시도
- `admin_actions.agent_execute_run` audit 에 mode='create_pr' 기록
- GitHub keeper0301/government-information 의 새 PR 자동 생성 (사장님 review 후 1 click merge)

## W1 안전망 (코드 0, 기존 agent-policy.ts 가 처리)

- `area: "agent_call"` + `action: codex_*` 가 PR_ACTIONS 매칭 → create_pr 분기
- destructive·secrets·payments 영구 blocked (agent-policy.ts:81~111)
- AGENT_W1_ENABLED=false 시 모든 PR_ACTIONS → admin_review (clay W0 fallback)

## W1 결과 추적 (1주 후 = 6/1)

```sql
-- W1 1주차 PR 생성 누적
SELECT
  details->>'action' AS codex_action,
  COUNT(*) AS pr_created,
  COUNT(*) FILTER (WHERE details->>'pr_merged' = 'true') AS merged
FROM admin_actions
WHERE action = 'agent_execute_run'
  AND details->>'mode' = 'create_pr'
  AND created_at >= NOW() - INTERVAL '7 days';
```

**판단 기준** (6/1 시점):
| 지표 | 임계 | W2 GO 조건 |
|---|---|---|
| pr_created | ≥ 3 | Codex 가 실제 fix 발견 능력 검증 |
| merged | ≥ 60% pr_created | 사장님 PR 품질 적정성 검증 |

## W2 spec (참고만, 6/1 결정 시점 별도 spec)

- auto_execute 활성화 (코드 수준 변경 사장님 승인 없이)
- 영역: prompt_tuning · notification_copy_change · non_destructive_backfill
- 사장님 메모리 [[codex-autonomous-phase6-w0-2026-05-18]] 의 W2 spec 표 참조

## 회귀 위험 (W1 활성화)

| 위험 | 가드 |
|---|---|
| Codex 가 잘못된 PR 생성 (스크래퍼 깨짐) | 사장님 PR review 시 reject → Codex 학습 (다음 sidecar cycle 에서 회피) |
| GH_AGENT_PAT 유출 | Render env sensitive + 90일 expiration |
| Vercel 빌드 실패 (PR merge 후) | CI 자동 차단 (메모리 [[keepioo-phase1-ops-safety]] 의 GitHub Actions 가동) |
| codex_blog_publish_fix 가 lib/ai.ts revert 같은 큰 변경 | agent-policy.ts 의 touchesSchema 가드 + 사장님 PR review |

## 5/25 클로드 자동 실행 (사장님 요청 시)

다음 세션에서 사장님이 "Codex W1 진행하자" 명시 시:
1. Step 1 SQL query 실행 (DB 측정)
2. 임계 충족 시 Step 2 가이드 + Chrome MCP 자동화 (GitHub PAT 발급)
3. Step 3 Vercel + Render env 등록 (Chrome MCP 자동화)
4. Step 4 발동 + audit 검증

## 참조

- [[codex-autonomous-phase6-w0-2026-05-18]] — W0 spec + 가동 검증
- [[keepioo-2026-05-18-session]] — 5/18 메가 세션 종합
- 코드: `lib/autonomous-ops/agent-policy.ts` (PR_ACTIONS + AGENT_W1_ENABLED)
- 코드: keepio_agent repo (sidecar Codex 통합)
