# Codex 자율 운영 통합 spec (Phase 6 — 100% 자동화)

**작성일**: 2026-05-18
**작성자**: 클로드 (사장님 요청)
**목표**: 사장님 평시 0분 + 사고 시에도 0분 (Codex 자율 진단·fix·deploy)
**전제**: [autonomous_ops_master] Phase 1~5 완료. agent-policy.ts (5/17 hardening 30d26ad) single source of truth.

---

## 1. Why — 100% 자동화의 의미

현재 (Phase 1~5 완료):
- 사장님 매일 30초 (autonomous hub 점검) + 사고 시 SMS·텔레그램 알림
- cron 자동 가동 → 사고 자동 진단 (Phase 1) → 사장님 SMS

**남은 사장님 부담** (Codex 가 대체할 영역):
1. **사고 fix 결정·실행** — health-alert SMS 받으면 사장님이 어드민 진입 → 진단 → fix 결정 → 코드 변경 → push
2. **운영 결정** — press tier floor 튜닝, dedupe 임계 조정, AdSense 재신청 등
3. **콘텐츠 보강** — 블로그 외 SNS·티스토리 자율 발행 (Phase 5-B/C 미완)

Codex 통합 = 위 3 영역 자동화. 단 **agent-policy 절대 우회 X** — destructive·secrets·payments 는 영구 blocked.

---

## 2. Architecture (3 layer)

```
[keepio-agent sidecar (별도 repo, Render/VPS/PC)]
  ├ scheduler (정기 점검 5분~30분 cycle)
  ├ Codex CLI 호출 (사고 진단·fix·decision)
  └ keepioo 사이트 측 endpoint 호출
        ↓ HTTPS + AGENT_SECRET (별도 발급)
[keepioo /api/agent/* (신규, 본 spec)]
  ├ /api/agent/diagnose — 사고 진단 데이터 fetch (read-only)
  ├ /api/agent/execute — 액션 실행 요청 (agent-policy 거침)
  └ /api/agent/audit — 액션 결과 audit
        ↓
[agent-policy.ts decideAgentAutomation (single source of truth)]
  ├ auto_execute → 즉시 실행
  ├ create_pr → GitHub PR 생성 (사장님 review 후 merge)
  ├ admin_review → admin_actions 큐 적재 + 사장님 SMS·텔레그램
  └ blocked → 거부 + 텔레그램 즉시 알림 (사고 시그널)
```

**핵심 설계 결정**:
- **sidecar (별도 repo)** 가 Codex 호출 — Vercel function 60s timeout 회피 + cost 분리
- **keepioo 사이트** 는 endpoint 만 제공 (agent-policy 게이트 + audit)
- **agent-policy.ts** 가 Claude/Codex/cron/auto-fix 공통 boundary

---

## 3. 첫 자율 영역 (좁게 시작, ramp-up)

### W0 (Codex 권한 최소 시작, 1주)
- `diagnose` 만 가능 (read-only DB query, health-check 결과 등)
- 모든 액션 → `admin_review` 또는 `create_pr` (auto_execute 0)
- 1주 운영 후 결정 정확성 검증 → W1 진입

### W1 (bug_fix create_pr 모드, 1주)
- 스크래퍼 regex 깨짐·UI fix 등 PR 자동 생성 → 사장님 1 click merge
- 사장님 PR 검토 부담 ~5분/일

### W2 (안전 영역 auto_execute, 1주)
- 검증된 PR_ACTIONS (prompt_tuning·notification_copy_change·non_destructive_backfill)
- destructive·auth·secrets·payments 는 영구 blocked/admin_review.
- 2026-05-18 사장님 승인: DB schema 변경은 W1부터 migration PR 생성까지 허용한다. 운영 DB 직접 적용은 별도 W2 dispatcher와 검증 후만 허용한다.

### W3+ (점진 확장)
- 콘텐츠 자율 발행 (Phase 5-B/C)
- 운영 결정 (press tier floor 튜닝 등) — quality_approved=true 가드 필수

---

## 4. 안전망 (불변 — 절대 우회 X)

### 4-1. agent-policy 거치는 모든 액션
- `/api/agent/execute` 가 `decideAgentAutomation` 무조건 호출
- agent-policy bypass 코드 경로 0 (review 시 강제 확인)

### 4-2. AGENT_SECRET 분리
- CRON_SECRET 와 **별도 환경변수**
- sidecar 만 접근, GitHub Actions 등 다른 cron 은 사용 X
- rotate 주기: 분기 1회 또는 사고 시 즉시

### 4-3. Kill switch
- `AGENT_DISABLED=true` env → `/api/agent/*` 모두 503 반환
- 사고 발견 시 사장님 또는 클로드가 1줄 env 변경으로 즉시 차단

### 4-4. Rate limit
- sidecar → keepioo 요청 **분당 10건 cap**
- 초과 시 429 + 텔레그램 즉시 알림 (sidecar 폭주 사고 차단)

### 4-5. Cost cap
- Codex 호출 **1일 $5 cap** (사장님 결정)
- sidecar 측 daily counter + 초과 시 자동 정지
- keepioo 측은 admin_actions audit 누적으로 사후 검증

### 4-6. Audit 모든 액션
- admin_actions row + 텔레그램 알림 (사장님 가시성)
- audit 누락 시 cron 정상이라도 가시성 0 사고 재발 위험 (5/17 naver-news 사고와 동일 패턴)

### 4-7. agent-policy 확장 검토
- 신규 area: `agent_call` (Codex 호출 자체 분류)
- 신규 action: `codex_diagnose` (auto_execute), `codex_fix_regex` (create_pr), `codex_decide_threshold` (admin_review)

---

## 5. 사장님 결정 영역 (spec implementation 전)

| # | 결정 | 옵션 | 기본 권장 |
|---|---|---|---|
| 1 | AGENT_SECRET 발급 | 사장님 외부 액션 | 64자 랜덤 (openssl) |
| 2 | sidecar 배포 위치 | Render / VPS / PC | KeepioAgentCard 가 이미 health URL 보유 → 동일 위치 |
| 3 | Codex 비용 한도 | $1~10/일 | **$5/일 시작** (월 ~$150 cap) |
| 4 | W0→W1 ramp-up 속도 | 1주 / 2주 / 1개월 | **1주** (Phase 1~5 패턴 따름) |
| 5 | sidecar Codex 호출 방식 | OpenAI Codex API / Codex CLI (npx) | **Codex CLI** (CLI 가 PR 생성·git 통합 simple) |
| 6 | PR 생성 권한 | GitHub PAT (사장님 발급) | GH_AGENT_PAT env (sidecar 만 사용) |
| 7 | 첫 자율 시나리오 | 사고 진단 / 콘텐츠 / 결정 | **사고 진단** (W0 가장 안전) |

---

## 6. 구현 단계 (이번 spec 동의 후)

### Stage 1 — spec 마감 (이번)
- 본 문서 사장님 review + 동의

### Stage 2 — /api/agent/diagnose endpoint (가장 안전, read-only)
- `app/api/agent/diagnose/route.ts` 신규
- AGENT_SECRET 검증 + AGENT_DISABLED 체크
- rate limit 분당 10
- 입력: `{ question: string }`
- 출력: `{ data: <relevant DB snapshot> }` (LLM 미사용, 사전 정의 query set)
- 9 query template (health / cron audit / news 추세 / blog publish status / spending 등)
- audit `admin_actions.agent_diagnose_run`

### Stage 3 — /api/agent/execute + agent-policy 통합 (W0 모드)
- `app/api/agent/execute/route.ts` 신규
- 입력: `AgentOperation` (agent-policy.ts 타입)
- `decideAgentAutomation` 호출 → mode 별 분기
- W0: 모든 액션 admin_review or create_pr (auto_execute 0)
- audit `admin_actions.agent_execute_run`

### Stage 4 — sidecar 측 Codex 호출 패턴
- 사장님 별도 repo / 또는 클로드 도움
- sidecar 가 Stage 2/3 endpoint 호출
- diagnose 결과 → Codex prompt → 액션 결정 → execute 호출

### Stage 5 — W1 ramp-up
- 1주 운영 검증 후 create_pr 모드 활성화
- GitHub PAT (`GH_AGENT_PAT`) env 등록
- sidecar 가 PR 생성·branch 생성·코드 변경 commit

---

## 7. agent-policy 확장 (Stage 3 동시)

`lib/autonomous-ops/agent-policy.ts` 에 추가:

```typescript
export type AgentOperationArea =
  | "site_ops"
  | "content"
  | "external_publish"
  | "bug_fix"
  | "security"
  | "data"
  | "secrets"
  | "payments"
  | "agent_call";  // 신규 — Codex 호출 자체 분류

// AUTO_ACTIONS 확장
const AUTO_ACTIONS = new Set([
  // ... 기존
  "codex_diagnose",  // 신규 — read-only DB query
]);

// PR_ACTIONS 확장 (W1 ramp-up 후)
const PR_ACTIONS = new Set([
  // ... 기존
  "codex_scraper_fix",  // W1
  "codex_ui_copy_fix",  // W1
]);
```

회귀 테스트:
- `area="agent_call"` + `action="codex_diagnose"` → `auto_execute`
- `area="agent_call"` + `action="codex_scraper_fix"` → `create_pr`
- `area="agent_call"` + `destructive=true` → `blocked` (기존 가드)

---

## 8. 비용·운영 영향

| 항목 | 추정 |
|---|---|
| Codex CLI 비용 | $5/일 cap = $150/월 (사장님 결정) |
| sidecar 호스팅 | 별도 (Render free / 사장님 PC) |
| keepioo Vercel 부담 | endpoint 3 routes, 분당 10 cap → 미미 |
| admin_actions 누적 | 일 100~500 row 추가 (audit) |
| 사장님 시간 | W0 1주: 0분 / W1+: PR review 5분/일 |

---

## 9. 사고 시나리오 + 대응

| 시나리오 | 대응 |
|---|---|
| sidecar 폭주 (분당 100건+) | rate limit 429 + 텔레그램 알림 |
| Codex 결정 잘못 (예: 자격 부족 사용자 자동 환불) | agent-policy `payments` 영구 blocked. 사고 0 |
| AGENT_SECRET 유출 | kill switch + secret rotate |
| sidecar 무한 retry loop | cost cap 도달 → 자동 정지 + 사장님 알림 |
| audit 누락으로 진단 불가 | endpoint 모두 try/finally audit + 사전 review 필수 |
| Codex 비용 폭주 | daily cap $5 + 80% 도달 시 텔레그램 사전 알림 (G4 패턴 재사용) |

---

## 10. Open Questions (사장님 결정 대기)

1. sidecar repo 위치 / 이미 존재? — KeepioAgentCard 의 health URL 이 곧 sidecar
2. Codex API key 보관 — sidecar env / Vercel env 어디?
3. GitHub PAT 권한 범위 — keepioo repo only? branch protection 우회?
4. 첫 자율 시나리오 — diagnose only (가장 안전) vs 작은 자동 fix 1건?
5. W0→W1 ramp-up trigger — 1주 후 자동 / 사장님 수동 승인?

---

## 11. 참조

- 메모리: `project_keepioo_autonomous_ops_master_2026_05_08.md` (Phase 1~5 청사진)
- 메모리: `project_agent_policy_hotfix_2026_05_17.md` (agent-policy single source of truth)
- 메모리: `project_keepioo_2026_05_17_telegram_phase*.md` (텔레그램 봇 원격 원격 — 사장님 모바일 운영)
- 코드: `lib/autonomous-ops/agent-policy.ts` (현 권한 정책)
- 코드: `app/admin/autonomous/page.tsx` (Phase 1~5 hub + KeepioAgentCard)
- 코드: `lib/analytics/keepio-agent-status.ts` (sidecar health 통합 — 5/17 802a18b)
