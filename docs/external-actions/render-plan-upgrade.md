# Render Starter plan 업그레이드 가이드 (2026-05-19)

> **작성일**: 2026-05-19
> **목적**: Codex sidecar 82분 cycle 사고 해소 (의도 30분)
> **비용**: $7/월 ($84/년)
> **예상 소요**: 3분

## 사고 진단 요약 (5/18)

`keepio_agent/src/sidecar/scheduler.ts:142` 의 cron 설정:
```typescript
cron.schedule("*/30 * * * *", () => {
  void safeRun("keepioo-agent-loop", runKeepioAgentLoop);
}, { timezone: "Asia/Seoul" });
```

설정 자체는 정상 (`*/30` = 매 30분). 그러나 실측 cycle 82분.

**확정 원인**: Render free plan **15분 idle sleep**.
- sleep 중 cron timer 자체 정지
- wake-up 시 catch-up 없음 → cycle 누락
- 24h 중 sleep 시간 만큼 cycle 손실

## 영향

### 현재 (W0 모드, 5/18~5/24)
- diagnose 만 가동 → mutate 0 → 사고 안전성 영향 0
- 사장님 가시성 영향 ↓ (사고 진단 41분 늦어짐 평균)

### W1 ramp-up 후 (5/25~)
- create_pr 빈도 ↓ — fix PR 평균 41분 늦게 생성
- 사고 → fix PR 시간 = 사이트 down 시간 증가
- **권장**: W1 ramp-up 전 plan 업그레이드

## 업그레이드 절차 (3분)

### Step 1 — Render dashboard 접속

```
https://dashboard.render.com/web/srv-d84vlgek1jcs73andjbg
```

### Step 2 — Settings → Instance Type

좌측 메뉴 **Settings** → **Instance Type** → **Change**

### Step 3 — Starter 선택

- **Free** (현재) → **Starter** ($7/월)
- Confirm

### Step 4 — Save

자동 재배포 시작 (~3분). always-on 활성화.

## 검증 (업그레이드 후 24h)

```sql
SELECT
  COUNT(*) AS total,
  EXTRACT(EPOCH FROM (NOW() - MIN(created_at)))/60 AS minutes_window
FROM admin_actions
WHERE action = 'agent_diagnose_run'
  AND created_at >= NOW() - INTERVAL '24 hours';
```

**기대 결과**: total ≥ 450 (예상 480, 30분 cycle × 48 × 10 question).

기존 159 (5/18 측정) 대비 2.5배 가속.

## 사장님 완료 신고 (자동 hide)

업그레이드 후 클로드에게 "Render 업그레이드 완료" 알려주면:

```sql
INSERT INTO admin_actions (action, details)
VALUES ('render_plan_upgraded',
        jsonb_build_object('plan', 'starter', 'upgraded_at', NOW()));
```

→ /admin/autonomous PendingExternalActionsCard 자동 hide.

## 회피 옵션 (사장님 비용 절감 시)

**외부 ping 매 14분** — free plan 유지:
- cron-job.org 에서 매 14분 `https://keepio-agent.onrender.com/readyz` ping
- sleep 차단 → 30분 cycle 정상화
- 단 free plan 의 750h/월 한도 (24h × 31 = 744h) 가깝게 가동 → 한도 초과 위험
- 비용 0 vs always-on 보장 부재

**권장**: $7/월 = ₩9,500/월 = AdSense 검수 통과 시 1주일 수익으로 회복 가능. always-on 안정성 우선.

## 참조

- 메모리: [[codex-sidecar-cycle-diagnosis-2026-05-18]]
- 코드: `keepio_agent/src/sidecar/scheduler.ts:142`
- 사고 발견: 2026-05-18 W0 1일차 가동 검증
- 권장 시점: W1 ramp-up (5/25) 전
