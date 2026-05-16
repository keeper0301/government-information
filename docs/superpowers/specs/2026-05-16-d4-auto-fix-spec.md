# Phase D-4 — parser 자동 수정 spec

> **작성일**: 2026-05-16
> **사장님 선택**: ② 강력 — vitest 통과 시 자동 commit·push
> **현재 단계**: step 1 (dry-run logic 골격, 실제 git push X)

## 단계별 분해

### Step 1 (이번 commit)

- `lib/monitoring/auto-fix.ts` — `analyzeForAutoFix(report)` 골격
- env `D4_AUTO_FIX_ENABLED` toggle (기본 false)
- 사고별 action 분기:
  - `manual_required`: 사이트 차단·cron 누락 (자동 fix 위험)
  - `regex_fix` + `dry_run`: skipped > 50% + sample 10+
- weekly-scrape-monitor cron 이 매주 호출
- audit 에 `d4_auto_fix_attempts` 저장

### Step 2 (별도 commit, ~3시간)

- LLM 통합 — Claude/GPT API 호출
- parser 실패 sample HTML → 새 regex 패턴 generation
- vitest + tsc 자동 검증

### Step 3 (별도 commit, ~3시간)

- git 자동 commit·push (worktree 분기)
- commit message LLM generation
- vitest 통과 시만 master push
- rollback 자동화 (다음 cron 가동 시 sample 재검증)

## 안전 단계

1. dry-run 1주 (step 1): 사장님 텔레그램 보고만, 실제 변경 X
2. 사장님 검수 후 step 2 활성화
3. step 2 LLM + step 3 git 자동화 점진적

## 환경 변수

| 변수 | 값 | 효과 |
|---|---|---|
| `D4_AUTO_FIX_ENABLED` | `true`/`1` | dry-run (step 1) |
| `D4_AUTO_FIX_LLM_ENABLED` | `true`/`1` | step 2 LLM |
| `D4_AUTO_FIX_COMMIT_ENABLED` | `true`/`1` | step 3 git 자동 |

3 변수 모두 true 시만 진짜 자동 fix.

## 사장님 1 클릭 가속 대안

step 3 자동 commit 대신:
- LLM 결과 + vitest 통과 → 텔레그램 "1 클릭 승인" link
- 사장님 클릭 시 endpoint 호출 → git push
- 자동 push 위험 회피 + 검수 가속

## 첫 호출

다음 월요일 (5/19) KST 09:30 weekly-scrape-monitor cron 부터 D-4 step 1 dry-run 결과 텔레그램 포함.
