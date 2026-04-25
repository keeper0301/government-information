# mss loan detail-fetcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** loan_programs 테이블의 mss source 549건의 `eligibility / contact_info / detailed_content` 3개 컬럼을 raw_payload 에서 추출해 채우는 detail-fetcher 추가.

**Architecture:** youthcenter detail-fetcher 와 100% 동일 패턴 — 외부 HTTP 호출 0, DB 의 `raw_payload` JSONB 필드만 사용. 신규 파일 1개 (`lib/detail-fetchers/mss.ts`) + 레지스트리 한 줄 추가. 마이그레이션 없음.

**Tech Stack:** TypeScript, Next.js App Router, Supabase (DB query), `lib/detail-fetchers/index.ts` 의 `DetailFetcher` 인터페이스.

**Spec:** `docs/superpowers/specs/2026-04-25-mss-loan-detail-fetcher-design.md`

**중요한 사전 결정 (spec 5절):** 자동 unit test 안 만든다. 외부 호출 0 + 단순 함수 4개 라 mock test 가치 낮음. 진짜 검증은 prod DB dryrun.

---

## Task 1: raw_payload 실데이터 한 건 확인 + 매핑 결정

**왜 먼저인가:** mss collector 의 `parseAllTags(b)` 가 mssBizService_v2 List 응답의 모든 XML 태그를 dict 로 보존한다 (`lib/collectors/loans-mss.ts:35-51`). 어떤 태그가 들어있는지 plan 작성 시점엔 가설 — Task 2 의 매핑 코드 정확도를 위해 Task 1 에서 실제 데이터를 본다.

**Files:** 없음 (조사 단계)

- [ ] **Step 1: Supabase MCP 또는 대시보드로 mss raw_payload 1건 SELECT**

다음 SQL 을 실행:

```sql
SELECT id, source_id, title, raw_payload
FROM loan_programs
WHERE source_code = 'mss'
  AND raw_payload IS NOT NULL
  AND raw_payload != '{}'::jsonb
ORDER BY created_at DESC
LIMIT 1;
```

raw_payload 가 비어있는 row 만 있으면 collector 가 다음 cron 에서 채울 때까지 대기 (또는 `/admin/news` 에서 수동 수집 트리거 후 다시 SELECT).

- [ ] **Step 2: 응답의 raw_payload JSON 키 목록 적어두기**

응답이 다음과 같다고 가정:

```json
{
  "title": "2026 소상공인 정책자금 융자",
  "viewUrl": "https://www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=...",
  "dataContents": "사업 본문 텍스트...",
  "writerPosition": "소상공인",
  "applicationStartDate": "2026-04-01",
  "applicationEndDate": "2026-12-31",
  "businessField": "...",
  "manager": "...",
  ...
}
```

**다음 5개 카테고리에 해당하는 키가 raw_payload 에 어떤 이름으로 있는지** 표로 정리:

| 카테고리 | 가설 키 후보 | 실제 키 (Step 1 결과로 채움) |
|---|---|---|
| 자격 요건 (eligibility) | requirements / condition / supportTarget / recipientCondition / qualification / writerPosition | ? |
| 담당 부서·연락처 (contact_info) | contactInfo / manager / department / telNo / email | ? |
| 사업 본문 (detailed_content 의 핵심) | dataContents | ? |
| 모집 분야 (detailed_content) | businessField / supportField / businessCategory | ? |
| 신청 기간 원문 (detailed_content) | applicationPeriod / recruitPeriod | ? |

이 표는 Task 2 의 매핑 코드의 직접 입력이 된다.

- [ ] **Step 3: mss 만의 무의미 패턴 점검**

raw_payload 의 값들을 훑어봐서 youthcenter 의 SKIP set (`["-", "해당없음", "해당 없음", "제한없음", "제한 없음", "N", "없음"]`) 외에 mss 만 자주 등장하는 placeholder 가 있는지 확인. 흔한 추가 후보: `"미정"`, `"추후 공지"`, `"해당사항 없음"`, `"별도 공지"`. 발견하면 Task 2 의 SKIP set 에 추가.

---

## Task 2: lib/detail-fetchers/mss.ts 작성

**Files:**
- Create: `lib/detail-fetchers/mss.ts`

- [ ] **Step 1: 파일 생성 + 헤더 주석**

```typescript
// ============================================================
// mss (중소벤처기업부) Detail Fetcher — raw_payload 활용 (외부 호출 없음)
// ============================================================
// data.go.kr 의 mssBizService_v2 는 별도 Detail 엔드포인트를 제공하지 않음.
// collector (lib/collectors/loans-mss.ts) 가 List API 응답 XML 의 모든 태그를
// parseAllTags() 로 dict 화해서 raw_payload (JSONB) 에 보존 중 (Phase 1, 66b97aa).
// 이 fetcher 는 외부 HTTP 호출 없이 raw_payload 에서 필드를 추출해
// eligibility / contact_info / detailed_content 컬럼을 채움.
//
// 패턴은 youthcenter.ts (be3e5dc) 와 100% 동일.
//
// 전제: loan row 에 source_code='mss' 이면서 raw_payload 가 비어있지 않아야 함.
// Phase 1 적용 전에 수집된 row (raw_payload NULL) 는 applies() false 로 스킵.
// 다음 collector cron 이 같은 source_id 를 upsert 하면서 raw_payload 갱신 →
// 그 다음 enrich 라운드에 들어옴.
// ============================================================

import type { DetailFetcher, DetailResult, RowIdentity } from "./index";
```

- [ ] **Step 2: MssItem 타입 정의** (Task 1 의 표를 바탕으로 정확한 키 이름 사용)

가설 기반 (Task 1 결과로 보정):

```typescript
// mss List API 응답의 한 항목 — collector 의 parseAllTags() 가 dict 로 변환.
// 모든 필드는 unknown — runtime 에서 isMeaningful() / str() 로 안전 추출.
type MssItem = {
  // 기본 필드 (collector 가 이미 다른 컬럼에 사용)
  title?: unknown;
  viewUrl?: unknown;
  dataContents?: unknown;
  writerPosition?: unknown;
  applicationStartDate?: unknown;
  applicationEndDate?: unknown;
  // 자격 요건 후보 (Task 1 에서 실제 키 확인 후 보정)
  requirements?: unknown;
  supportTarget?: unknown;
  recipientCondition?: unknown;
  qualification?: unknown;
  // 담당·연락 후보
  contactInfo?: unknown;
  manager?: unknown;
  department?: unknown;
  telNo?: unknown;
  email?: unknown;
  // 본문 보강 후보
  businessField?: unknown;
  supportField?: unknown;
  applicationPeriod?: unknown;
  recruitPeriod?: unknown;
};
```

- [ ] **Step 3: isMeaningful + str 헬퍼**

youthcenter 와 동일하지만 SKIP set 에 mss 만의 패턴 (Task 1 Step 3 결과) 추가:

```typescript
// "제한없음", "해당없음", "-", "미정", "추후공지" 등 무의미한 값은 표시 안 함.
function isMeaningful(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const t = raw.trim();
  if (t.length === 0) return false;
  const SKIP = new Set([
    "-",
    "해당없음",
    "해당 없음",
    "해당사항 없음",
    "제한없음",
    "제한 없음",
    "N",
    "없음",
    "미정",
    "추후 공지",
    "추후공지",
    "별도 공지",
  ]);
  return !SKIP.has(t);
}

function str(raw: unknown): string | null {
  return isMeaningful(raw) ? raw.trim() : null;
}
```

- [ ] **Step 4: buildEligibility — 자격 요건 조합**

writerPosition (대상) + 추가 자격 필드를 라벨링해 합침. fallback chain 으로 어떤 키 이름이든 첫 매치 사용:

```typescript
// 지원 대상·자격 요건 — writerPosition 필수 + 추가 자격 텍스트 보강.
// writerPosition 은 collector 가 이미 target 컬럼에 저장하지만, 사용자 화면의
// "지원 대상" 박스는 eligibility 컬럼을 보여주므로 여기서도 한 번 더 노출.
function buildEligibility(p: MssItem): string | null {
  const lines: string[] = [];
  const target = str(p.writerPosition);
  if (target) lines.push(`대상: ${target}`);
  // fallback chain — Task 1 결과로 실제 키 1~2개로 좁힐 것
  const condition =
    str(p.requirements) ||
    str(p.supportTarget) ||
    str(p.recipientCondition) ||
    str(p.qualification);
  if (condition) lines.push(`자격: ${condition}`);
  return lines.length > 0 ? lines.join("\n") : null;
}
```

- [ ] **Step 5: buildContactInfo — 담당 부서·연락처**

```typescript
// 담당 부서·연락처 — fallback chain 으로 mss 의 실제 키 패턴에 적응.
function buildContactInfo(p: MssItem): string | null {
  const lines: string[] = [];
  const dept = str(p.department) || str(p.manager);
  const contact = str(p.contactInfo);
  const tel = str(p.telNo);
  const email = str(p.email);
  if (dept) lines.push(`담당부서: ${dept}`);
  if (contact && contact !== dept) lines.push(`담당자/문의: ${contact}`);
  if (tel) lines.push(`연락처: ${tel}`);
  if (email) lines.push(`이메일: ${email}`);
  return lines.length > 0 ? lines.join("\n") : null;
}
```

- [ ] **Step 6: buildDetailedContent — 풍부한 본문**

dataContents 가 핵심 본문이고, 그 외 보강 필드를 섹션 헤더와 함께 합침:

```typescript
// 상세 본문 — dataContents 핵심 + 모집분야·신청기간 원문 등 보강 텍스트.
// "▸ 섹션명\n내용" 포맷. youthcenter 와 동일 시각적 구조.
function buildDetailedContent(p: MssItem): string | null {
  const sections: string[] = [];
  const main = str(p.dataContents);
  const field = str(p.businessField) || str(p.supportField);
  const period = str(p.applicationPeriod) || str(p.recruitPeriod);
  if (main) sections.push(`▸ 사업 내용\n${main}`);
  if (field) sections.push(`▸ 모집 분야\n${field}`);
  if (period) sections.push(`▸ 신청 기간\n${period}`);
  return sections.length > 0 ? sections.join("\n\n") : null;
}
```

- [ ] **Step 7: fetcher 객체 + default export**

```typescript
const fetcher: DetailFetcher = {
  sourceCode: "mss",
  label: "mss raw_payload 추출",
  // 외부 호출 없으므로 env 체크 불필요 — 언제나 활성.
  enabled: () => true,

  // mss 이면서 source_id·raw_payload 둘 다 있어야 적용.
  // raw_payload NULL 인 레거시 row 는 false → enrich route 가 skipped 처리.
  applies: (row: RowIdentity) => {
    if (row.source_code !== "mss") return false;
    if (!row.source_id) return false;
    if (!row.raw_payload || typeof row.raw_payload !== "object") return false;
    return true;
  },

  async fetchDetail(row: RowIdentity): Promise<DetailResult | null> {
    const payload = row.raw_payload as MssItem | null;
    if (!payload) return null;

    const eligibility = buildEligibility(payload);
    const contact = buildContactInfo(payload);
    const detailed = buildDetailedContent(payload);

    // 추출 가능한 값이 하나도 없으면 null — enrich route 가 skipped 로 기록
    if (!eligibility && !contact && !detailed) return null;

    return {
      eligibility,
      contact_info: contact,
      detailed_content: detailed,
    };
  },
};

export default fetcher;
```

---

## Task 3: 레지스트리에 mss 등록

**Files:**
- Modify: `lib/detail-fetchers/index.ts`

- [ ] **Step 1: import 라인 추가**

기존 import 블록에 한 줄 추가:

```typescript
import bokjiroDetail from "./bokjiro";
import youthcenterDetail from "./youthcenter";
import mssDetail from "./mss";
```

- [ ] **Step 2: DETAIL_FETCHERS 배열에 등록**

```typescript
export const DETAIL_FETCHERS: DetailFetcher[] = [
  bokjiroDetail,
  youthcenterDetail,
  mssDetail,
];
```

순서는 first-match-wins 인데 각 fetcher 의 applies() 가 source_code 기준 strict 매치라 순서 무관. 가독성을 위해 알파벳·코드명 순으로 두면 충분.

---

## Task 4: 타입체크 + 자체 검증

**Files:** 없음 (검증)

- [ ] **Step 1: TypeScript 타입체크**

Run: `npx tsc --noEmit`
Expected: 출력 없음 (에러 없음). 출력이 있으면 mss.ts 의 import / 타입 / 메서드 시그니처 점검.

- [ ] **Step 2: ESLint (변경된 파일만)**

Run: `npx eslint lib/detail-fetchers/`
Expected: 에러·경고 없음.

- [ ] **Step 3: Task 1 의 raw_payload vs Task 2 의 매핑 비교**

Task 1 Step 2 의 표 (실제 키 이름) 와 Task 2 의 fallback chain (`str(p.requirements) || str(p.supportTarget) || ...`) 을 비교. 실제 키가 chain 에 있는지 확인. 없으면:

- mss.ts 의 MssItem 타입에 그 키 추가
- buildXxx 함수의 fallback chain 에 그 키 추가
- typecheck 다시 (Step 1)

이 step 이 spec 의 리스크 #1 (raw_payload 매핑 가설이 틀림) 의 안전망.

---

## Task 5: 커밋·푸시 + prod dryrun

**Files:**
- Modify: 위 Task 들의 모든 변경

- [ ] **Step 1: 커밋**

```bash
git add lib/detail-fetchers/mss.ts lib/detail-fetchers/index.ts
git commit -m "$(cat <<'EOF'
feat(loan): mss detail-fetcher Phase 2 — raw_payload 추출

- lib/detail-fetchers/mss.ts 신규 (youthcenter 패턴)
- 외부 HTTP 호출 0, raw_payload JSONB 에서 eligibility / contact_info /
  detailed_content 3컬럼 추출
- 마이그레이션 없음, 새 cron 없음, 새 endpoint 없음
- mss 549건 중 raw_payload 채워진 row 부터 자동 enrich 진입

스펙: docs/superpowers/specs/2026-04-25-mss-loan-detail-fetcher-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: 푸시**

```bash
git push origin master
```

Vercel 빌드 2~3분 후 반영.

- [ ] **Step 3: 사장님이 prod dryrun 5건 트리거**

배포 반영 후 사장님 액션:

1. https://www.keepioo.com/admin/enrich-detail 접속
2. `source_table=loan` 선택 (있다면) 또는 일반 trigger 클릭
3. 결과 화면에서 mss row 가 ok / failed / skipped 어느 쪽으로 분류됐는지 확인

기대치: ok 비율 60% 이상 (raw_payload 가 채워진 mss row 의 경우).

- [ ] **Step 4: 결과 확인 — DB 직접 SELECT**

```sql
SELECT id, title, eligibility, contact_info, LEFT(detailed_content, 200) AS detailed_preview
FROM loan_programs
WHERE source_code = 'mss'
  AND last_detail_fetched_at > now() - interval '10 minutes'
ORDER BY last_detail_fetched_at DESC
LIMIT 10;
```

방금 enrich 된 mss row 들의 3컬럼이 의미있는 텍스트로 채워졌는지 사람 눈으로 확인.

- [ ] **Step 5: 결과 평가 + 후속 결정**

| 결과 | 다음 행동 |
|---|---|
| ok 비율 60% 이상 + 3컬럼이 합리적 | 완료. cron 자연 진행 모니터링만 |
| ok 비율 30~60% + 일부 빈 결과 | mss.ts 의 fallback chain 에 누락 키 추가 후 재배포 |
| ok 비율 30% 미만 / 모두 빈 결과 | Task 1 의 raw_payload 가설이 크게 틀림. mss.ts 매핑 전면 재작성 |
| skipped 100% | applies() 또는 raw_payload 자체에 문제. 별도 진단 |

---

## Task 6: 일주일 모니터링 (사장님 자율)

**Files:** 없음 (운영)

- [ ] **Step 1: 3~7일 후 채움률 SQL**

```sql
SELECT
  COUNT(*) FILTER (WHERE eligibility IS NOT NULL) AS eligibility_filled,
  COUNT(*) FILTER (WHERE contact_info IS NOT NULL) AS contact_filled,
  COUNT(*) FILTER (WHERE detailed_content IS NOT NULL) AS detailed_filled,
  COUNT(*) AS total
FROM loan_programs
WHERE source_code = 'mss';
```

기대치 (배포 후 1주일):
- detailed_filled / total ≥ 70% (raw_payload 가 일주일 내 갱신되는 row 비율 기준)
- eligibility / contact 는 데이터 따라 30~70% 범위

- [ ] **Step 2: office-hours assignment 와 연결**

자영업자 1명한테 keepioo 의 mss 상세 페이지 보여주기. "지원 대상" 박스가 분리돼 보이는지 + 5초 안에 "신청 가능한가" 판단 나오는지 관찰. 이 결과는 다음 office-hours 의 입력.

---

## 자체 리뷰 (writing-plans skill 마지막 단계)

**1. Spec 커버리지 점검:**
- spec §2 (컴포넌트 4개 함수) → Task 2 Step 3~7
- spec §3 (데이터 흐름) → Task 5 (커밋 후 자동 cron)
- spec §4 (수용 기준 6개) → Task 4 Step 1~2 (#1 typecheck), Task 3 (#2 레지스트리), Task 5 Step 4 (#3 dryrun), Task 4 Step 3 (#4 applies false 처리), 멱등성 #5 는 `last_detail_fetched_at` 갱신만 (코드상 자동), #6 회귀는 first-match-wins 구조로 자동
- spec §6 (작업 단위 4개) → Task 1~5 에 분배
- spec §7 (리스크 5개) → Task 4 Step 3 (매핑 가설 검증) + Task 5 Step 5 (결과 평가)
- spec §8 (검증 절차 5단계) → Task 5 Step 3~5 + Task 6

**2. Placeholder scan:**
- TBD/TODO/implement later 없음
- "Task 1 결과로 보정" 은 placeholder 가 아니라 의도된 검증 흐름 (spec 에 명시된 가설 단계)

**3. Type consistency:**
- `MssItem` 타입과 `buildXxx` 함수가 같은 키 이름 사용 ✓
- `DetailFetcher` 인터페이스 (외부 정의) 의 `sourceCode / enabled / applies / fetchDetail` 정확히 구현 ✓
- youthcenter 의 함수 시그니처와 일관 ✓

리뷰 통과. 수정 사항 없음.
