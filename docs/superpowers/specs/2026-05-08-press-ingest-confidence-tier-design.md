# 광역 보도자료 L2 자동 confirm — 신뢰도 tier + 회수 메커니즘

작성일: 2026-05-08
저자: 사장님 + Claude (auto mode)

## 배경

keepioo 광역 보도자료 ingest 는 이미 L2 자동 confirm 이 가동 중. `apply_url` 이 4 layer fallback 으로 거의 100% 채워져 LLM 분류 결과 (welfare/loan) 가 사장님 클릭 없이 자동 등록된다.

**현재 사각지대**:
- LLM 응답에 신뢰도 정보가 없어 "확신 없는" 분류도 그냥 자동 등록됨
- 잘못 등록된 정책의 회수 절차가 정책 상세 페이지의 hidden 토글 1건씩만 가능 (일괄 검수 X)
- 자동 등록 통계·회수율·mid 정확도가 보이지 않아 점진 확장 결정 근거 0

**B안 핵심 추가**:
- 신뢰도 차원 (`high`/`mid`/`low`) 추가 → low 는 pending 큐 보존
- 사장님 1클릭 회수 메커니즘
- 자동 등록·회수 가시성 (운영·SMS·주간 digest 통합)

---

## 결정 사항

| 결정 포인트 | 선택 | 비고 |
|---|---|---|
| 1. 신뢰도 모델 | **A. high/mid/low 3단** | LLM `confidence` 1 필드 추가 |
| 2. 임계치 출발 | **B. 적극 출발** | `high`+`mid` 자동 confirm, `low` 만 pending |
| 3. 회수 진입점 | **A+B** | 전용 페이지 `/admin/auto-confirmed` + 정책 상세 배지 둘 다 |
| 4. 자동 등록 알림 | **A+B+C+D 전체 조합** | 평소 0 + 매일 23:00 SMS + low 적체 health-alert + 주간 digest |
| 5. 회수 데이터 처리 | **A+B 조합** | `is_hidden` (RLS 가드, news_posts 028 패턴) + `revoked_at`/`revoked_by` (audit·통계) |

---

## 아키텍처

### 1. classify.ts — LLM 응답에 confidence 추가

`ClassifyResult` 에 `confidence: "high" | "mid" | "low"` 추가. prompt 보강:

> 분류 신뢰도 (`confidence`) 도 함께 출력하세요:
> - `high`: 보도자료에 신청 자격·금액·기간이 모두 명시 + 정책 사업이 확실
> - `mid`: 일부 정보 누락 또는 modal verb 사용 ("지원할 예정") 인 경우
> - `low`: 본문이 짧거나 광고·이벤트 가능성 있어 사장님 검토 필요

LLM 응답 누락·잘못된 값 시 `low` fallback (보수적).

### 2. candidates.ts — confidence 기반 분기

`classifyStatus(result)` 함수 확장:

```typescript
function classifyStatus(result: ClassifyResult): {
  status: PressCandidateStatus;
  programType: PressCandidateProgramType;
  skipReason: string | null;
  confidenceTier: "high" | "mid" | "low";
} {
  if (!result.is_policy) return { ..., status: "skipped", skipReason: "not_policy" };
  if (result.program_type === "unsure") return { ..., status: "skipped", skipReason: "program_type_unsure" };

  const tier = result.confidence ?? "low"; // fallback 보수적
  // 환경변수 AUTO_CONFIRM_TIER_FLOOR 가 결정 (default "mid" — high+mid 자동)
  const floor = (process.env.AUTO_CONFIRM_TIER_FLOOR ?? "mid") as "high" | "mid" | "low";
  const autoEligible = TIER_RANK[tier] >= TIER_RANK[floor];

  return {
    status: "pending", // 모두 pending 으로 시작 — autoConfirm 단계가 tier 보고 분기
    programType: result.program_type,
    skipReason: null,
    confidenceTier: tier,
  };
}
```

`autoConfirmPendingPressCandidates` 가 tier 기반으로 분기:
- `tier >= floor` → 자동 등록 (welfare/loan INSERT + candidate confirmed)
- `tier < floor` (즉 low) → pending 유지, 사장님 /admin/press-ingest 검토

### 3. DB 마이그레이션 — 077_press_confidence_tier.sql

```sql
-- ─── press_ingest_candidates ────────────────────────────────
-- 신뢰도 tier 추가
ALTER TABLE public.press_ingest_candidates
  ADD COLUMN IF NOT EXISTS confidence_tier TEXT
    CHECK (confidence_tier IS NULL OR confidence_tier IN ('high', 'mid', 'low'));

-- status enum 확장 — 'revoked' 추가 (069 마이그레이션 CHECK 제약 갱신)
ALTER TABLE public.press_ingest_candidates
  DROP CONSTRAINT IF EXISTS press_ingest_candidates_status_check;
ALTER TABLE public.press_ingest_candidates
  ADD CONSTRAINT press_ingest_candidates_status_check
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'skipped', 'failed', 'revoked'));

-- ─── welfare_programs / loan_programs 양쪽 동일 패턴 ──────
-- 자동 등록 추적
ALTER TABLE public.welfare_programs
  ADD COLUMN IF NOT EXISTS auto_confirm_tier TEXT
    CHECK (auto_confirm_tier IS NULL OR auto_confirm_tier IN ('high', 'mid')),
  ADD COLUMN IF NOT EXISTS auto_confirmed_at TIMESTAMPTZ,
  -- news_posts 028 마이그레이션 패턴 — soft hide
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false,
  -- 회수 audit (사장님 의도 vs system 의도 구분)
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.loan_programs
  ADD COLUMN IF NOT EXISTS auto_confirm_tier TEXT
    CHECK (auto_confirm_tier IS NULL OR auto_confirm_tier IN ('high', 'mid')),
  ADD COLUMN IF NOT EXISTS auto_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── RLS 갱신 — is_hidden 가드 (028 패턴) ─────────────
-- 기존 anon·authenticated 무조건 SELECT 허용을 is_hidden=false 조건부로 교체
-- service_role 은 RLS 우회 → 어드민·서버 경로는 hidden 정책도 조회 가능
DROP POLICY IF EXISTS "welfare_programs_read" ON public.welfare_programs;
CREATE POLICY "welfare_programs_read"
  ON public.welfare_programs FOR SELECT
  USING (is_hidden = false);

DROP POLICY IF EXISTS "loan_programs_read" ON public.loan_programs;
CREATE POLICY "loan_programs_read"
  ON public.loan_programs FOR SELECT
  USING (is_hidden = false);

-- ─── 인덱스 ───────────────────────────────────────────
-- 최근 N일 자동 등록 모음 빠른 조회 (/admin/auto-confirmed)
CREATE INDEX IF NOT EXISTS idx_welfare_auto_confirmed_at
  ON public.welfare_programs(auto_confirmed_at DESC)
  WHERE auto_confirmed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loan_auto_confirmed_at
  ON public.loan_programs(auto_confirmed_at DESC)
  WHERE auto_confirmed_at IS NOT NULL;

-- 사용자 노출 효율 — partial index (대부분 is_hidden=false 라 적합)
CREATE INDEX IF NOT EXISTS idx_welfare_visible
  ON public.welfare_programs(created_at DESC)
  WHERE is_hidden = false;
CREATE INDEX IF NOT EXISTS idx_loan_visible
  ON public.loan_programs(created_at DESC)
  WHERE is_hidden = false;
```

DDL apply 사장님 명시 승인 후 prod 적용.

**RLS 갱신 회귀 위험 검증**:
- 기존 정책 `USING (true)` → `USING (is_hidden = false)` 변경
- 모든 row 의 `is_hidden=false` (default) 라 기존 사용자에게 보이는 정책은 그대로 보임
- 서버 경로는 service_role 이라 RLS 우회 (어드민 페이지 영향 0)
- 사장님이 회수 토글 누르기 전엔 `is_hidden=true` 인 row 0 — 회귀 위험 0

### 4. /admin/auto-confirmed — 운영 모음 페이지 (신규)

- 최근 1d / 3d / 7d / 30d 필터
- welfare/loan 통합 표 — title · ministry · auto_confirm_tier · auto_confirmed_at · 사용자 노출 상태
- 행 1개 클릭 → 정책 상세 미리보기 + 1클릭 회수
- 일괄 회수: 체크박스 선택 후 "선택 회수" 버튼
- 회수 동작: `welfare_programs.is_hidden=true` (또는 `loan_programs`) + candidate `status='revoked'` + `admin_actions.press_l2_auto_revoke`

### 5. /admin/welfare/[id] · /admin/loan/[id] — 배지 + 회수 UI

기존 상세 페이지에 새 컴포넌트 1개 추가:
- `auto_confirm_tier` 가 set 되어 있으면 "🤖 AI 자동 등록 ({tier})" 배지 표시
- 배지 옆 "회수" 버튼 → 1클릭 회수 (`is_hidden=true` + audit)

### 6. health-alert 통합 — low tier 적체 임계치

기존 `lib/health-check.ts` `checkThresholds` 에 신규 alert 추가:
- `pressLowTierBacklog` 신호 — `press_ingest_candidates` 의 `confidence_tier='low'` + `status='pending'` count
- **별도 임계치 `PRESS_LOW_TIER_FLOOR` (default `10`)** — 기존 `PRESS_PENDING_FLOOR` 와 분리해 low tier 만 따로 추적 (적극 출발 채택했기 때문에 평소 pending 큐는 low 만 쌓임 → 두 임계치 의미가 거의 동일하지만, 미래에 floor 환경변수 변경 시 분리가 안전)
- 발화 시 recommendation: "low 신뢰도 후보 적체 — `/admin/press-ingest` 검토 또는 `AUTO_CONFIRM_TIER_FLOOR=low` 로 일시 적극화"

### 7. 매일 23:00 KST 자동 등록 카운트 SMS — 신규 cron

- `app/api/cron/auto-confirm-daily-summary/route.ts`
- 24h 자동 등록 N건 + 회수 M건 + low 큐 K건 SMS
- 0건이면 발송 skip
- vercel.json 에 등록

### 8. 주간 digest 통합 — 기존 cron 1줄 추가

`/api/cron/weekly-digest` 가 이미 가동 중. 본문에 1 섹션 추가:
- 주간 자동 등록 N건 / 회수 M건 / 회수율 X%
- tier 분포: high N / mid M
- mid 회수율이 5% 초과 시 경고 표시 (점진 확장 시그널)

---

## 데이터 흐름

```
광역 RSS 수집 (기존)
  → news_posts insert
  → press-ingest cron (KST 10:30 / 15:30 / 19:30)
    → LLM classify (신규: confidence 응답)
    → press_ingest_candidates upsert (status='pending', confidence_tier 저장)
    → autoConfirmPendingPressCandidates
      → tier >= floor 인 후보 → welfare/loan INSERT (auto_confirm_tier·auto_confirmed_at 채움)
      → tier < floor (=low) → pending 유지

매일 23:00 KST cron
  → 24h 자동 등록·회수 카운트 SMS

매주 월 09:00 KST weekly-digest
  → 주간 자동 등록·회수율·tier 분포 SMS

매일 09:00 KST health-alert
  → low 큐 적체 시 통합 alert
```

---

## 회수 흐름

1. 사장님 `/admin/auto-confirmed` 또는 정책 상세 진입
2. 잘못 등록된 정책 발견 → 회수 버튼 클릭
3. server action 단일 트랜잭션:
   - welfare/loan row: `is_hidden=true`, `revoked_at=NOW()`, `revoked_by=actorId`
   - candidate: `status='revoked'`, `updated_at=NOW()` (이미 confirmed 였던 row)
   - `admin_actions.press_l2_auto_revoke` audit (actorId, candidate_id, table, program_id, auto_confirm_tier)
4. 사용자에게 즉시 노출 차단 (검색·홈·추천 모두 RLS 가드). 즐겨찾기 등 FK 유지.

**복원**: 사장님이 잘못 회수한 경우, 관리자 UI 에서 "복원" 버튼 → `is_hidden=false`, `revoked_at=NULL`, `revoked_by=NULL`, candidate `status='confirmed'` 복귀.

---

## 안전망

- 환경변수 `AUTO_CONFIRM_TIER_FLOOR` (default `mid`) — 1줄 toggle 로 `high` 만 자동 / 또는 `low` 까지 적극 자동 변경 가능
- `is_hidden=true` (DELETE 아님) → 사용자 알림·즐겨찾기 깨짐 0
- 회수 audit (`press_l2_auto_revoke`) → mid 정확도 통계 자동 누적
- 24h 무작위 샘플 수동 검수 (사장님 자율) — 첫 7일 권장

---

## 단위 테스트 범위

- `classify.ts` — confidence 누락·invalid → `low` fallback
- `candidates.ts` — `classifyStatus` 가 tier 별 분기 정확
- `autoConfirmPendingPressCandidates` — `AUTO_CONFIRM_TIER_FLOOR` env 별 동작 (high만 / mid+high / 전부)
- `health-check.ts` — low tier 적체 임계치 boundary
- 회수 server action — 권한·candidate status 갱신·is_hidden 토글

---

## 단계별 구현 순서

1. **DDL 077** — confidence_tier · auto_confirm_tier · auto_confirmed_at · is_hidden · revoked_at/by + RLS 갱신 + 인덱스
2. **classify.ts** — confidence 응답 + prompt 보강 + low fallback
3. **candidates.ts** — `classifyStatus` tier 분기 + autoConfirm tier filter + 회수 함수 (`revokeAutoConfirmed`)
4. **/admin/auto-confirmed 페이지** — 1d/3d/7d/30d 필터 · welfare/loan 통합 표 · 일괄 회수 · 복원
5. **정책 상세 배지** — `/admin/welfare/[id]`·`/admin/loan/[id]` 에 "🤖 AI 자동 등록 ({tier})" 배지 + 회수/복원 버튼
6. **health-alert 통합** — `pressLowTierBacklog` 신호 + `PRESS_LOW_TIER_FLOOR` env (default 10)
7. **매일 23:00 KST cron** — `auto-confirm-daily-summary` (24h 자동 등록·회수 카운트 SMS)
8. **주간 digest 1줄 통합** — 자동 등록·회수율·tier 분포·mid 회수율 경고
9. **단위 테스트** — classify confidence fallback / classifyStatus tier 분기 / autoConfirm env 별 동작 / health-check low 임계치 / 회수 server action 권한·상태 갱신

---

## 비용

- LLM: 응답 1 필드 추가만 — 비용 영향 0 (max_tokens 그대로)
- DDL: 인덱스 2개 — Supabase 디스크 영향 미미
- SMS:
  - 매일 23:00 KST 카운트 SMS = ~$1/월 추가 (30 SMS)
  - 주간 digest 는 이미 가동 (변경 0)
- 코드: 신규 ~600 라인 + 기존 보강 ~150 라인 + DDL 1 마이그레이션

총 추가 비용 ~$1/월. A 안과 동일 비용 (사장님 메시지 명시).

---

## 회귀 위험

- 기존 자동 confirm 흐름 (`apply_url` 기반) 은 그대로 — `confidence_tier` 추가만, default tier `low` 도 작동 유지 (별도 floor 처리)
- DDL nullable 컬럼만 추가 — 기존 row 영향 0
- `/admin/welfare/[id]` 상세 페이지는 배지 컴포넌트 1 줄 추가만 (조건부 렌더, default 표시 0)
- **RLS 갱신** — `USING (true)` → `USING (is_hidden = false)`. 모든 기존 row default false 라 동일 동작. 단, RLS 마이그레이션 시 일시적 락 가능 (테이블 큰 경우 < 1초). 자정 KST 시간대 적용 권장.

---

## 미해결 질문

- 없음 (사장님 결정 5개 모두 완료)
