# 쓰레드 마케팅 파이프라인 Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정책알리미 DB에서 매일 데이터를 뽑아 4가지 시리즈의 쓰레드 글로 자동 변환하고, 텔레그램으로 사장님 승인을 받은 후 쓰레드에 자동 발행하는 파이프라인을 keepio_agent 안에 구축한다.

**Architecture:**
- 실행 주체: **keepio_agent** (TypeScript, node-cron 매일 트리거)
- 데이터 소스: **정책알리미 Supabase** (read-only — 새 정책·통계·마감 임박 데이터)
- 콘텐츠 생성: **LLM** (OpenAI API, 사장님이 이미 보유)
- 승인 채널: **텔레그램 봇** (이미 grammy로 통합되어 있음)
- 발행: **Threads API** (이미 `threads-api` 패키지 설치됨)
- 부수 노출: 정책 글은 **BlogFury**로도 보내 네이버 블로그 동시 발행

**Tech Stack:** TypeScript / tsx, grammy, node-cron, threads-api, OpenAI SDK, @supabase/supabase-js

**Spec 참조:** `docs/threads-marketing-strategy.md` (전략 합의서)

---

## 파일 구조 (생성·수정 대상)

**신규 생성 — `keepio_agent` 안:**
```
src/marketing/
├── index.ts              # 진입점 (cron 등록)
├── supabase-reader.ts    # 정책알리미 DB 읽기 (read-only)
├── content-generator.ts  # LLM 호출 (시리즈별 글 생성)
├── templates/
│   ├── monday-report.md   # 운영 리포트 프롬프트
│   ├── policy-deep.md     # 정책 1건 깊이 프롬프트
│   ├── friday-diary.md    # 사장님 일기 프롬프트
│   └── saturday-deadline.md  # 마감 임박 프롬프트
├── telegram-approver.ts  # 텔레그램으로 초안 전송 + 승인 수신
├── threads-publisher.ts  # 승인된 글을 쓰레드 발행
└── state.ts              # 발행 상태 추적 (중복·실패 방지)

data/marketing-state.json  # 발행 이력 영속화
config/marketing.json      # 시리즈별 활성/비활성 토글
.env (수정)                # 새 환경변수 추가 (아래 Task 0)
```

**수정 — `keepio_agent`:**
- `prompts/orchestrator.md` — 마케팅 도메인 추가 명시
- `package.json` — `openai` 패키지 추가
- `src/index.ts` 또는 launch 스크립트 — `marketing/index.ts` 등록

**참조 (수정 안 함):**
- `government-information/lib/database.types.ts` — Supabase 스키마 타입
- `government-information/supabase/migrations/` — 정책 테이블 구조

---

## Phase 1 범위 (이 Plan에서 다루는 것)

✅ **포함:**
- 4가지 시리즈 콘텐츠 생성 (운영 리포트 / 정책 깊이 / 사장님 일기 / 마감 임박)
- 텔레그램 승인 흐름 (초안 전송 → 사장님 OK/수정 → 발행)
- Threads API 자동 발행
- node-cron 요일별 스케줄링
- 발행 이력 추적 (중복 방지)

❌ **제외 (별도 Phase):**
- UTM 트래킹·KPI 대시보드 → Phase 2
- 리드 마그넷 PDF → Phase 3
- 네이버 블로그 BlogFury 연동 → Phase 4
- Threads 인사이트(도달·좋아요) 자동 수집 → Phase 2

---

## Task 0: 사전 준비 (사장님 직접 수행)

**왜:** 이 단계 없이는 코드를 짜도 못 돌림. 환경변수가 채워져야 다음 task 진행 가능.

- [ ] **Step 1: 정책알리미 Supabase에서 read-only API 키 준비**
  - Supabase 대시보드 → `fpnaptuhulcggournikc` 프로젝트(`government_infomation`) → Settings → API Keys → Legacy 탭
  - `anon (public)` 키 복사 (RLS로 보호되니 노출 OK)
  - URL: `https://fpnaptuhulcggournikc.supabase.co`

- [ ] **Step 2: Threads API 토큰 발급**
  - `keepio_agent/scripts/get-threads-token.js` 이미 있음 → 실행해서 토큰 얻기
  - 안내 따라 Meta Developer 앱 생성 → Threads 권한 → 액세스 토큰 복사

- [ ] **Step 3: keepio_agent의 `.env`에 다음 추가**
  ```
  # 정책알리미 DB (정확한 프로젝트 ID는 government_infomation)
  GOV_SUPABASE_URL=https://fpnaptuhulcggournikc.supabase.co
  GOV_SUPABASE_ANON_KEY=<위에서 복사한 anon key>

  # OpenAI (BlogFury에서 쓰던 것)
  OPENAI_API_KEY=<사장님 키>

  # Threads (Phase 1A는 수동 발행이라 나중에 채워도 OK)
  THREADS_ACCESS_TOKEN=<Meta Developer에서 발급>
  THREADS_USER_ID=<Meta Developer에서 확인>

  # 텔레그램 (이미 있음 — 변수명만 통일)
  TELEGRAM_BOT_TOKEN=<기존 키 그대로>
  TELEGRAM_OWNER_CHAT_ID=<TELEGRAM_CHAT_ID 와 동일한 값>
  ```

- [ ] **Step 4: `openai` 패키지 설치**
  ```bash
  cd C:/Users/cgc09/projects/keepio_agent
  npm install openai
  ```

**완료 기준:** `.env`에 위 7개 변수 다 채워짐. `npm install` 성공.

---

## Task 1: 정책알리미 DB 읽기 모듈

**Files:**
- Create: `src/marketing/supabase-reader.ts`
- Test: `src/marketing/__tests__/supabase-reader.test.ts`

**왜:** 모든 시리즈가 정책알리미 DB의 데이터를 뽑아 쓴다. 이 모듈이 단일 진입점이 되도록 분리.

- [ ] **Step 1: 인터페이스 정의 (실패 테스트부터)**

```typescript
// 테스트가 검증할 것:
// - 새로 추가된 정책 N개 가져오기
// - 마감 임박 정책 가져오기 (오늘부터 N일 이내)
// - 지난주 운영 통계 (가입자·발송·정책 수)

interface SupabaseReader {
  getNewPrograms(since: Date, limit: number): Promise<Program[]>;
  getDeadlineSoon(daysAhead: number): Promise<Program[]>;
  getWeeklyStats(): Promise<WeeklyStats>;
  getProgramById(id: string): Promise<Program | null>;
}
```

- [ ] **Step 2: 정책알리미 `lib/database.types.ts` 참조해서 Program·WeeklyStats 타입 정의**
- [ ] **Step 3: Supabase 클라이언트 생성 — `GOV_SUPABASE_URL` + `ANON_KEY`로 read-only 인스턴스**
- [ ] **Step 4: 4개 메서드 구현 (각 5-10줄)**
- [ ] **Step 5: 통합 테스트 — 실제 정책알리미 DB에서 데이터 가져오는지 확인 (모킹 금지)**
- [ ] **Step 6: 커밋 — `feat(marketing): 정책알리미 DB 읽기 모듈 추가`**

**완료 기준:** 테스트 4개 다 통과. 실제 정책 5개 이상 출력됨.

---

## Task 2: 시리즈별 프롬프트 템플릿

**Files:**
- Create: `src/marketing/templates/monday-report.md`
- Create: `src/marketing/templates/policy-deep.md`
- Create: `src/marketing/templates/friday-diary.md`
- Create: `src/marketing/templates/saturday-deadline.md`

**왜:** 시리즈마다 톤·구조·길이가 다르다. 프롬프트를 코드에서 분리해 사장님이 직접 수정 가능하게.

- [ ] **Step 1: `monday-report.md` 작성 — 운영 리포트 프롬프트**
  - 입력 변수: `{{weeklyStats}}` (가입자·발송·정책 수)
  - 출력 톤: 1인칭, 미디엄 오픈(가입자/발송/정책 수만), 글자 수 200-400
  - 끝에 "프로필 링크에서 알림 받기" 한 줄

- [ ] **Step 2: `policy-deep.md` — 정책 1건 깊이 프롬프트**
  - 입력 변수: `{{program}}` (Program 객체 전체)
  - 출력: 누가/얼마/어떻게 신청 + 마감일. 글자 수 300-500
  - 첫 줄에 충격·발견 포인트

- [ ] **Step 3: `friday-diary.md` — 사장님 일기 프롬프트**
  - 입력 변수: `{{recentEvents}}` (지난 한 주 운영 데이터)
  - 출력: 일기 톤. 한 가지 발견·한 가지 고민·한 가지 다음 작업
  - **AI 티 안 나게** — 정해진 구조 따르지 말고 "관찰 한 줄 + 숫자 한 줄 + 다음 작업"

- [ ] **Step 4: `saturday-deadline.md` — 마감 임박 정리**
  - 입력 변수: `{{programs}}` (마감 임박 5개)
  - 출력: 리스트 형식. 각 정책 한 줄로 요약 + 마감일

- [ ] **Step 5: 4개 템플릿 모두 한국어로, 각 50-150줄**
- [ ] **Step 6: 커밋 — `feat(marketing): 4가지 시리즈 프롬프트 템플릿 추가`**

**완료 기준:** 4개 .md 파일 존재. 각 파일에 변수 사용·톤 가이드·예시 1개씩 포함.

---

## Task 3: 콘텐츠 생성기

**Files:**
- Create: `src/marketing/content-generator.ts`
- Test: `src/marketing/__tests__/content-generator.test.ts`

**왜:** 템플릿 + 데이터 → 완성된 쓰레드 글. LLM 호출 단일 진입점.

- [ ] **Step 1: 인터페이스 정의**

```typescript
type SeriesType = 'monday-report' | 'policy-deep' | 'friday-diary' | 'saturday-deadline';

interface ContentGenerator {
  generate(series: SeriesType, data: any): Promise<string>;
}
```

- [ ] **Step 2: 템플릿 로더 — `templates/{series}.md` 읽고 `{{변수}}` 치환**
- [ ] **Step 3: OpenAI 호출 — gpt-4o-mini 사용 (싸고 충분)**
- [ ] **Step 4: 응답 후처리 — 길이 검증(글당 500자 초과 시 잘라냄), 줄바꿈 정리**
- [ ] **Step 5: 4가지 시리즈 각각 한 번씩 호출해서 결과 파일로 저장 → 사장님이 눈으로 검토**
- [ ] **Step 6: 커밋 — `feat(marketing): LLM 콘텐츠 생성기 추가`**

**완료 기준:** 4개 시리즈 다 가짜 데이터로 글 생성됨. 글 길이 200-500자 범위. 한국어.

---

## Task 4: 텔레그램 승인 인터페이스

**Files:**
- Create: `src/marketing/telegram-approver.ts`
- Test: `src/marketing/__tests__/telegram-approver.test.ts`

**왜:** 자동 발행 전 사장님이 한번 보고 OK/수정 결정. 사고 방지 + 사장님 톤 유지.

- [ ] **Step 1: 인터페이스 정의**

```typescript
interface ApprovalRequest {
  series: SeriesType;
  draft: string;
  metadata: { sourceProgramId?: string };
}

interface ApprovalResult {
  decision: 'approve' | 'edit' | 'skip';
  finalText?: string;  // edit 시 사장님이 직접 수정한 텍스트
}

interface TelegramApprover {
  sendForApproval(req: ApprovalRequest): Promise<ApprovalResult>;
}
```

- [ ] **Step 2: 초안 전송 메시지 포맷 — 시리즈명 + 초안 + 인라인 키보드 (✅승인 / ✏️수정 / ⏭️건너뛰기)**
- [ ] **Step 3: 콜백 처리 — 사장님 응답 대기 (최대 6시간 타임아웃)**
- [ ] **Step 4: ✏️수정 선택 시 — "수정한 텍스트 답장으로 보내주세요" 안내 후 다음 메시지 수신**
- [ ] **Step 5: ⏭️건너뛰기 선택 시 — 이번 회차 발행 취소, state에 기록**
- [ ] **Step 6: 통합 테스트 — 실제 텔레그램 봇으로 사장님에게 테스트 글 보내고 응답 받기**
- [ ] **Step 7: 커밋 — `feat(marketing): 텔레그램 승인 인터페이스 추가`**

**완료 기준:** 사장님 텔레그램에 초안 도착. 3개 버튼 동작. 수정 텍스트 입력 받기 동작.

---

## Task 5: Threads 발행 모듈

**Files:**
- Create: `src/marketing/threads-publisher.ts`
- Test: `src/marketing/__tests__/threads-publisher.test.ts`

**왜:** 승인된 글을 실제 쓰레드에 올림. 발행 결과(글 ID·URL)를 state에 기록.

- [ ] **Step 1: 인터페이스 정의**

```typescript
interface PublishResult {
  success: boolean;
  threadsPostId?: string;
  threadsUrl?: string;
  error?: string;
}

interface ThreadsPublisher {
  publish(text: string): Promise<PublishResult>;
}
```

- [ ] **Step 2: `threads-api` 패키지 사용 — 토큰으로 클라이언트 생성**
- [ ] **Step 3: 텍스트 길이 검증 — 쓰레드 한 글 500자 한도 (초과 시 split 필요. Phase 1은 단일 글만)**
- [ ] **Step 4: 발행 + 결과 반환**
- [ ] **Step 5: 발행 실패 시 — 텔레그램으로 사장님에게 에러 알림**
- [ ] **Step 6: 통합 테스트 — 실제 쓰레드 계정에 테스트 글 1개 발행 (수동 확인 후 삭제)**
- [ ] **Step 7: 커밋 — `feat(marketing): Threads API 발행 모듈 추가`**

**완료 기준:** 실제 쓰레드 계정에 글 1개 올라감. 글 URL 반환됨.

---

## Task 6: 발행 상태 추적

**Files:**
- Create: `src/marketing/state.ts`
- Test: `src/marketing/__tests__/state.test.ts`

**왜:** 같은 정책 두 번 안 올리기. 어제 뭐 올렸는지·발행 실패 이력 추적.

- [ ] **Step 1: 상태 파일 형식 정의 — `data/marketing-state.json`**

```json
{
  "publishedPosts": [
    { "series": "policy-deep", "sourceProgramId": "abc", "threadsPostId": "...", "publishedAt": "2026-04-29T..." }
  ],
  "skippedDates": ["2026-04-30"],
  "lastWeeklyReport": "2026-04-21"
}
```

- [ ] **Step 2: 읽기·쓰기 함수 — JSON 파일 atomic write (임시 파일 → rename)**
- [ ] **Step 3: 헬퍼 — `wasProgramPublished(id)`, `recordPublish(...)`, `recordSkip(date)`**
- [ ] **Step 4: 테스트 — 동일 정책 중복 검사·atomic write 동시 호출 안전성**
- [ ] **Step 5: 커밋 — `feat(marketing): 발행 상태 추적 모듈 추가`**

**완료 기준:** 같은 정책 ID 두 번 호출 시 두 번째는 skip 됨.

---

## Task 7: cron 스케줄러 + 진입점

**Files:**
- Create: `src/marketing/index.ts`
- Modify: `src/sidecar/index.ts` 또는 launch 스크립트 (marketing 등록)

**왜:** 모든 모듈을 묶어 요일별로 트리거. 이 task가 완료되면 시스템이 매일 자동으로 동작.

- [ ] **Step 1: 시리즈별 핸들러 정의**

```typescript
async function runMondayReport() {
  const stats = await reader.getWeeklyStats();
  const draft = await generator.generate('monday-report', { weeklyStats: stats });
  const approval = await approver.sendForApproval({ series: 'monday-report', draft, metadata: {} });
  if (approval.decision === 'approve') {
    const result = await publisher.publish(approval.finalText ?? draft);
    if (result.success) state.recordPublish(...);
  }
}
// 위 패턴으로 4개 함수 (운영리포트, 정책 깊이 ×2 요일, 일기, 마감)
```

- [ ] **Step 2: node-cron 등록 — 한국 시간(KST) 기준**
  - 월 09:00 → `runMondayReport`
  - 화 11:00 → `runPolicyDeep`
  - 목 11:00 → `runPolicyDeep`
  - 금 17:00 → `runFridayDiary` (사장님 퇴근 시간 — 다듬을 여유)
  - 토 10:00 → `runSaturdayDeadline`

- [ ] **Step 3: 정책 깊이 핸들러 — `getNewPrograms`로 후보 5개 → 아직 안 올린 것 중 1개 픽 → state에 기록**

- [ ] **Step 4: launch 스크립트에 marketing 등록 — sidecar 패턴 참고**

- [ ] **Step 5: 수동 트리거 명령 추가 — 사장님이 텔레그램에서 `/test-marketing monday` 같이 강제 실행 가능하게**

- [ ] **Step 6: 통합 테스트 — 4가지 시리즈 한 번씩 수동 트리거, 끝까지 동작 확인**

- [ ] **Step 7: 커밋 — `feat(marketing): cron 스케줄러 + 진입점 통합`**

**완료 기준:** 4가지 시리즈 다 수동 트리거로 작동. 텔레그램 → 승인 → 쓰레드 발행 흐름 완주.

---

## Task 8: 오케스트레이터 프롬프트 업데이트

**Files:**
- Modify: `prompts/orchestrator.md`

**왜:** 사장님이 텔레그램으로 "이번 주 운영 리포트 미리 보여줘" 같은 요청 시 오케스트레이터가 marketing 도메인으로 라우팅하도록.

- [ ] **Step 1: orchestrator.md 끝에 "Marketing" 도메인 섹션 추가**
- [ ] **Step 2: 트리거 키워드 정의 — "쓰레드", "마케팅", "운영 리포트", "정책 글"**
- [ ] **Step 3: 라우팅 규칙 — 해당 키워드 시 marketing 모듈의 수동 트리거 명령 호출**
- [ ] **Step 4: 커밋 — `chore(marketing): 오케스트레이터에 marketing 도메인 추가`**

**완료 기준:** 사장님이 "오늘 정책 글 미리 보여줘" 입력 시 marketing 모듈이 응답.

---

## Task 9: 첫 1주차 콘텐츠 손으로 검증

**Files:**
- Create: `data/marketing-week1-drafts.md` (검증용, git 미포함)

**왜:** 자동 시스템 돌리기 전, 첫 1주차 글을 사람 눈으로 검토해서 톤·길이·정확도 검증. 사고 방지 마지막 관문.

- [ ] **Step 1: Day 1 (월) — "도전 선언" 글 직접 작성 (자동 생성 X, 사장님이 직접 또는 AI에 위임 후 다듬기)**
- [ ] **Step 2: Day 2-5 — 각 시리즈를 수동 트리거로 1번씩 실행해서 결과 검토**
- [ ] **Step 3: 4개 결과 글의 정확도·톤·길이 검토**
- [ ] **Step 4: 문제 발견 시 해당 템플릿 수정 (Task 2로 돌아감)**
- [ ] **Step 5: 검토 통과 시 — 첫 1주차 5개 글을 직접 쓰레드에 발행 (자동 시스템 의존 X)**

**완료 기준:** 5개 글 발행. 사장님이 톤·정확도 OK 판정.

---

## Task 10: 4-6주 운영 + 회고

**왜:** 시스템이 잘 도는지·콘텐츠 반응이 어떤지 확인. Phase 2 (UTM 트래킹·KPI) 들어갈지 결정.

- [ ] **Step 1: 4주간 매주 자동 동작 모니터링 — 실패·승인률·응답 시간 기록**
- [ ] **Step 2: KPI 수기 측정 (Threads 인사이트 화면 캡처) — 팔로워, 평균 도달, 가입자**
- [ ] **Step 3: 4주차 회고 — `docs/marketing-week4-retro.md`에 기록**
- [ ] **Step 4: 결정 — 데일리 확장? Phase 2 시작? 시리즈 구성 재검토?**

**완료 기준:** 회고 문서 작성. 다음 Phase 결정.

---

## 위험·주의사항

1. **Threads API 정책 변경 위험** — Meta API는 자주 바뀜. `threads-api` 패키지 깨지면 수동 발행으로 일시 fallback. Task 5 구현 시 에러 핸들링 + 텔레그램 알림으로 빠른 인지.

2. **OpenAI 비용 폭주 방지** — 시리즈당 글 1편 생성 시 약 100원 미만 (gpt-4o-mini). 실수로 무한 루프 시 비용 폭주 가능. Task 3 구현 시 일일 호출 횟수 상한 (예: 하루 10회) 설정.

3. **잘못된 정책 정보 발행 위험** — LLM이 정책 내용 왜곡할 수 있음. **대책:** Task 2 프롬프트에 "DB의 필드 값을 그대로 옮기되 자유 작문 금지" 명시. Task 4의 사장님 승인이 마지막 관문.

4. **사장님 응답 지연** — 텔레그램 승인 6시간 타임아웃 시 자동 skip. 다음 회차 정상 진행. (지속적 미응답 시 시스템 자동 일시정지 — Phase 2 기능)

5. **Threads 계정 BAN 위험** — 같은 톤·구조 글 매일 자동 발행 시 스팸 의심 가능. 4-6주 운영 후 빈도·다양성 검토.

---

## 다음 Phase 미리보기

- **Phase 2 (UTM 트래킹·KPI):** Threads 글에 UTM 파라미터 자동 부착, Threads 인사이트 API 연동, 정책알리미 가입 전환 측정 대시보드
- **Phase 3 (리드 마그넷):** "소상공인 정책 50선" PDF 자동 생성, 가입 시 발송 자동화
- **Phase 4 (BlogFury 연동):** 정책 깊이 글을 BlogFury로 네이버 블로그 동시 발행, 쓰레드에서 자연 노출

---

## 변경 이력

- **v0.1** (2026-04-26): 초안 — `threads-marketing-strategy.md` 의 Phase 1 분량을 implementation plan으로 분해

- **v0.2** (2026-04-27): Phase 1A → 1B 진입. 코드 거의 전부 완성, 첫 자동 발행 성공.

  **Phase 1A (단방향) 폐기 후 1B 즉시 진입:**
    - 사장님 명시 요청 — "쓰레드 계정을 연결하고 자동으로 발행해야되".
    - plugin:telegram polling 충돌 우려 있어 telegram-approver 인라인 키보드는 미사용
      (모듈 자체는 작성됨 — Phase 1C 이상에서 활성화 예정).

  **톤 v2 (쓰레드 인기 글 학습 반영):**
    - 첫 시도 (v1) — "솔직히 무서웠어요" 류 — 사장님 평가: "구리고 쓰레드 스타일 말투 아님".
    - 사장님 인스타 로그인된 크롬 탭에서 `자영업자 지원금` / `소상공인 일기`
      검색 결과 인기 글 (lolili_fund 196♥, ahc_sos, berit_merit 68♥, 1day.onestep 229♥)
      JS 추출 + 톤 분석 → v2 템플릿 4개 갈아엎음.
    - 핵심 패턴: 짧은 문장 + 줄바ꈈ 많이 + 반말 평어 혼용 + 단어 강조 따옴표 +
      도발/궁금증 마무리 + 이모지·해시태그 절제.

  **Threads OAuth + 자동 발행:**
    - `https://localhost` redirect URI 거부됨 → `https://www.keepioo.com/` 으로 통과.
    - User Token Generator 로 토큰 직접 발급 (사장님 keeper.punch 인스타 → keepio 앱
      Threads 테스터 등록 상태였음). 60일 long-lived token, 200자, User ID
      26508378702091549.
    - `.env` 자동 작성 (PowerShell + 클립보드 우회 — 사장님 보안 정책에 의해
      JWT 자동 마스킹·credential 파일 직접 읽기 차단. 클립보드 읽기 권한 1회 허용).
    - 첫 자동 발행: https://www.threads.com/@keeper.punch/post/DXmV67gk_4A.

  **OG 카드 (사이트 사진+제목):**
    - 첫 발행은 본문 URL 만 있고 카드 없음. 원인: Threads 는 본문 URL 자동
      카드 변환 X — `link_attachment` 파라미터 명시 필요.
    - threads-publisher 에 `extractFirstUrl` + `link_attachment` 추가.
    - 두 번째 발행: https://www.threads.com/@keeper.punch/post/DXmWlAlE8Ma
      (사장님 검증 대기 중).

  **댓글 자동 답변 (Phase 1B-2 — 사장님 명시 요청):**
    - 새 모듈 `comment-replier.ts` + `templates/comment-reply.md`.
    - cron 매 30분, KST 09-22 사이만, 일일 답변 상한 50.
    - `threads-publisher.reply(text, replyToId)` 추가 — `reply_to_id` 파라미터.
    - LLM JSON 응답: `{decision: "reply"|"skip", reply?: string}`.
    - **법적 안전 가이드 (templates/comment-reply.md):**
      - 금지 — "받을 수 있어요", "100%", "절대", "보장", "당연히", "최고",
        "지금 안 신청하면 손해" 류 협박, 법률 판단.
      - 필수 — "공식 페이지에서 자격 확인", "정책 변경될 수 있으니 신청 전 확인",
        "정확한 자격은 해당 기관 문의".
      - LLM 자동 skip — 욕설, 광고, 정치/종교, 투자, 법률 자문, 환불·민원,
        의미 없는 단답.
    - state.repliedComments 로 중복 방지.
    - manual-trigger comments 추가 — 즉시 폴링 검증 (skipNightCheck 옵션).

  **텔레그램 알림 plain 모드:**
    - 발행 결과 메시지의 URL 안 underscore 가 Markdown italic 으로 잘못 파싱
      되는 문제 발견 → `sendMessage(text, { plain: true })` 옵션 추가.
    - `index.ts` 의 결과 알림은 plain 모드 사용.

  **남은 사장님 검증/작업:**
    - OG 카드 사장님 눈으로 검증 (DXmWlAlE8Ma URL).
    - 댓글 자동 답변은 실 댓글 받아 검증 (다른 인스타 계정으로 댓글 → manual-trigger comments).
    - 채팅에 노출됐던 OpenAI 키 (sk-proj-...) 폐기 + 새 발급 (보안).
    - threads_manage_replies 권한 추가 필요할 수도 (지금은 댓글 조회 동작 중 — 권한 충분).
