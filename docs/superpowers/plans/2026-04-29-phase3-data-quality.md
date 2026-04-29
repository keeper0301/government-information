# Phase 3 — 데이터 품질 implementation plan (2026-04-29)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** 트래픽이 SEO 진입로 (Phase 2) 로 들어왔을 때 콘텐츠 풍부도·정확도로 체류시간·전환 ↑.

**Architecture:**
- B1 = bizinfo (기업마당) collector 신규 + K-Startup collector 신규. youthcenter 패턴 (List API 본문 raw_payload 추출).
- B3 = 기존 `duplicate_of_id` 컬럼 활용한 dedupe 알고리즘 + 백필 cron + admin UI.
- B2 = keepio_agent 와 중복 위험 + 비용 부담 (Anthropic Haiku 가이드 생성 5h) → **Phase 3 에서 제외, 별도 phase 로 미뤘다 검토**.

**Tech Stack:** Next.js 15 / Supabase / data.go.kr API / Anthropic 미사용 (LLM 의존성 0).

---

## File Structure

### B1 — bizinfo · K-Startup collector (3h)
- **Create:** `lib/loan-collectors/bizinfo.ts` — bizinfo 지원사업정보 API collector
- **Create:** `lib/loan-collectors/kstartup.ts` — K-Startup 사업공고 collector
- **Modify:** `lib/loan-collectors/index.ts` — 두 collector 등록
- **Modify:** `app/api/collect/route.ts` — bizinfo / kstartup 트리거 추가
- **Modify:** `lib/listing-sources.ts` — `LOAN_LISTING_EXCLUDED_SOURCES` 갱신 (신규 source_code 가 사용자 노출되도록)
- **Test:** `__tests__/lib/loan-collectors/bizinfo.test.ts` — XML/JSON 파싱 단위 테스트
- **Test:** `__tests__/lib/loan-collectors/kstartup.test.ts` — 동일

### B3 — welfare/loan dedupe 강화 (2h)
- **Create:** `lib/dedupe/welfare-loan.ts` — 매칭 알고리즘 (title + region + apply_end + benefit_tags 유사도)
- **Create:** `app/api/dedupe-detect/route.ts` — 일일 cron 핸들러 (중복 후보 → `duplicate_of_id` 후보 표시 컬럼 추가 또는 `pending_duplicates` 테이블)
- **Create:** `app/admin/dedupe/page.tsx` — 중복 후보 list + 수동 confirm 버튼
- **Modify:** `vercel.json` — dedupe cron 매일 02:00 KST 등록
- **Test:** `__tests__/lib/dedupe/welfare-loan.test.ts` — 매칭 알고리즘 단위 테스트
- **Migration (선택)**: `supabase/migrations/068_dedupe_candidates.sql` — pending_duplicates 테이블 (사장님 명시 승인 필요)
  - 또는 기존 `duplicate_of_id` 컬럼만 활용 (DDL 없음 — 추천)

### B2 — Phase 3 에서 제외
- 사유: `keepio_agent` (외부 마케팅 시스템) 가 이미 정책 가이드 발행 중. keepioo 자체 LLM 발행 시 중복 + 비용 부담.
- 후속 검토: Phase 3 종료 후 keepio_agent 발행 빈도·범위 검토 → 결정.

---

## 사장님 결정 포인트 (plan 진행 전 OK 필요)

1. **B1 외부 액션 — API 키**
   - bizinfo: WordPress 프로젝트 (`C:\Users\cgc09\projects\government_policy`) 의 `pm_bizinfo_api_key` 옵션 값 필요. 사장님 검색 5분
   - K-Startup: data.go.kr 에서 신규 발급 (자동승인, 5분)
   - 키 미등록 상태에서도 collector 코드는 graceful (key 없으면 skip 로그)

2. **B3 마이그레이션 (DDL) 추가 vs 기존 컬럼 활용**
   - (a) 기존 `duplicate_of_id` (007 마이그레이션) 만 활용 — DDL 신규 0, 추천
   - (b) `pending_duplicates` 별도 테이블 신규 — DDL 1건 추가 (068), 사장님 명시 승인 필요
   - 추천: (a) — 단순함, DDL 없음, 후속 확장 시 (b) 가능

3. **B2 폐기 OK?**
   - keepio_agent 중복 위험 + 비용 부담 → Phase 3 제외 추천

이 3 결정을 받아야 plan 진행 가능. **답 형식**: `1 ok / 2 a / 3 ok` 정도 단답.

---

## Task 1: B1 bizinfo collector (10 step)

**Files:**
- Create: `lib/loan-collectors/bizinfo.ts`
- Modify: `lib/loan-collectors/index.ts`, `app/api/collect/route.ts`, `lib/listing-sources.ts`
- Test: `__tests__/lib/loan-collectors/bizinfo.test.ts`

### - [ ] Step 1: WordPress collector 참조

`C:\Users\cgc09\projects\government_policy\wordpress\wp-content\plugins\policy-manager\class-bizinfo-collector.php` 읽고 파라미터·필드 매핑 파악. 핵심:
- endpoint: `https://www.bizinfo.go.kr/uss/rss/bizPbancListJson.do`
- params: `crtfcKey`, `dataType=json`, `pageUnit=100`
- 응답 필드: `pblancNm` (제목), `bsnsSumryCn` (사업요약), `pldirSportRealmLclasCodeNm` (분야) 등

### - [ ] Step 2: lib/loan-collectors/bizinfo.ts 작성

기존 `lib/loan-collectors/mss.ts` 패턴 참고. 핵심:
- `BIZINFO_API_KEY` env 가드
- fetch + 응답 정규화 (id / source_id / source_url / title / description / region / apply_start / apply_end / industry / handler / contact / raw_payload)
- raw_payload JSONB 저장 (Phase 2 detail-fetcher 패턴)
- 100건 페이지네이션 (1~5 페이지 = 최대 500건)
- supabase upsert by source_id

### - [ ] Step 3: lib/loan-collectors/index.ts 에 bizinfo 등록

`COLLECTORS` 배열에 추가.

### - [ ] Step 4: app/api/collect/route.ts 트리거 추가

기존 mss/kinfa 트리거 참고해 bizinfo 추가. cron 매핑 (vercel.json) 도 동일 패턴.

### - [ ] Step 5: lib/listing-sources.ts 검토

bizinfo 가 `LOAN_LISTING_EXCLUDED_SOURCES` 에 들어가지 않도록 (사용자 노출 의도). 기존 mss 와 동등 처리.

### - [ ] Step 6: 단위 테스트 작성

mock JSON 응답 → 정규화 함수 검증 (~5 case: 정상·빈 응답·필드 누락·날짜 파싱·페이지네이션).

### - [ ] Step 7: tsc + vitest 검증

```bash
npm run ci
```

### - [ ] Step 8: env 등록 안내문 commit message 에 포함

사장님 외부 액션:
- WordPress 프로젝트에서 `pm_bizinfo_api_key` 검색 → Vercel env `BIZINFO_API_KEY` 등록
- /api/collect/bizinfo 호출 후 `loan_programs.source_code = 'bizinfo'` 카운트 확인

### - [ ] Step 9: Commit (push 안 함)

```bash
git add lib/loan-collectors/bizinfo.ts \
  lib/loan-collectors/index.ts app/api/collect/route.ts \
  lib/listing-sources.ts vercel.json \
  __tests__/lib/loan-collectors/bizinfo.test.ts
git commit -m "feat(collector): bizinfo (기업마당) loan collector 신규 (Phase 3 B1)
..."
```

### - [ ] Step 10: Spec + Code quality reviewer dispatch

---

## Task 2: B1 K-Startup collector (8 step)

**Files:**
- Create: `lib/loan-collectors/kstartup.ts`
- Modify: `lib/loan-collectors/index.ts`, `app/api/collect/route.ts`
- Test: `__tests__/lib/loan-collectors/kstartup.test.ts`

### - [ ] Step 1: data.go.kr K-Startup API 가이드 PDF 참조

context7 또는 Exa 로 K-Startup `/data/15125364` API 파라미터·응답 구조 확인.

### - [ ] Step 2~7: bizinfo 와 동일 패턴 반복 (collector 작성 → index 등록 → 트리거 → 테스트 → 검증 → commit)

핵심 차이:
- endpoint: K-Startup 공식 (data.go.kr serviceKey 인증)
- 응답: 사업공고 목록 (사업명·신청기간·지원대상·신청대상연령·우대사항·모집진행여부)

### - [ ] Step 8: Spec + Code quality reviewer dispatch

---

## Task 3: B3 dedupe 강화 (8 step)

**Files:**
- Create: `lib/dedupe/welfare-loan.ts`, `app/api/dedupe-detect/route.ts`, `app/admin/dedupe/page.tsx`
- Modify: `vercel.json`
- Test: `__tests__/lib/dedupe/welfare-loan.test.ts`

### - [ ] Step 1: lib/dedupe/welfare-loan.ts 매칭 알고리즘 작성

```ts
// 동일 정책 후보 매칭 — 4 시그널 가중 합
//  · title 정규화 후 substring (가중 0.4)
//  · region 매칭 (가중 0.2)
//  · apply_end 동일/±7일 (가중 0.2)
//  · benefit_tags overlap (가중 0.2)
// 합 ≥ 0.7 이면 중복 후보
//
// 입력: 같은 source_code 가 아닌 두 row (다른 출처에서 같은 정책 수집)
// 출력: { score, candidate_id }
export function detectDuplicateScore(rowA, rowB): number;
```

### - [ ] Step 2: 단위 테스트 5 case
- 동일 정책 (모든 시그널 매칭) → 1.0
- 제목 다르고 region/apply_end 일치 → 0.4 (false negative)
- 다른 정책 (다른 region·apply_end) → < 0.3
- benefit_tags 일치만 → 0.2
- 경계: ≥ 0.7 임계 검증

### - [ ] Step 3: app/api/dedupe-detect/route.ts cron 핸들러

매일 02:00 KST 실행:
- welfare/loan 테이블에서 최근 7일 신규 row 가져옴
- 다른 source_code 의 활성 row 와 페어 매칭
- score ≥ 0.7 인 후보만 `duplicate_of_id` 컬럼에 후보 ID 저장 (수동 confirm 전 임시 표시)
- 또는 별도 컬럼 `duplicate_candidate_id` 추가? — 신규 컬럼 = DDL 사장님 명시 승인 필요

### - [ ] Step 4: app/admin/dedupe/page.tsx — 중복 후보 list + confirm 버튼

```tsx
// 중복 후보 카드 — 좌측 row, 우측 candidate, 매칭 score
// 사장님이 [중복 확정] 또는 [다른 정책] 클릭
// 중복 확정 시 duplicate_of_id 영구 저장 + 사용자 노출에서 제외
```

### - [ ] Step 5: vercel.json 에 cron 등록

```json
{
  "path": "/api/dedupe-detect",
  "schedule": "0 17 * * *"  // KST 02:00 = UTC 17:00 (전일)
}
```

### - [ ] Step 6: tsc + vitest 검증

### - [ ] Step 7: Commit

```bash
git add lib/dedupe/welfare-loan.ts \
  app/api/dedupe-detect/route.ts \
  app/admin/dedupe/page.tsx \
  vercel.json \
  __tests__/lib/dedupe/welfare-loan.test.ts
git commit -m "feat(dedupe): welfare/loan 중복 정책 자동 탐지 + admin 확정 UI (Phase 3 B3)
..."
```

### - [ ] Step 8: Spec + Code quality reviewer dispatch

---

## Task 4: Phase 3 마무리 (5 step)

### - [ ] Step 1: Phase 3 final reviewer dispatch
### - [ ] Step 2: master push (Task 1 + 2 + 3 묶음)
### - [ ] Step 3: 메모리 신규 작성 (`project_keepioo_phase3_data_quality.md`)
### - [ ] Step 4: MEMORY.md 추가
### - [ ] Step 5: 마스터 plan ✅ 표시

---

## 자체 리뷰 체크리스트

- [x] keepio_agent 중복 위험 회피 (B2 제외)
- [x] DDL 신규 0 (기존 `duplicate_of_id` 컬럼 활용)
- [x] graceful env 가드 (사장님 키 등록 전후 동작 안전)
- [x] 단위 테스트 (collector 정규화 + dedupe 알고리즘)
- [x] cron 등록 (dedupe 매일 02:00 KST, bizinfo·kstartup collect 적정 빈도)

---

## 사장님 외부 액션

Phase 3 push 후:
1. **bizinfo API 키**: WordPress 프로젝트에서 `pm_bizinfo_api_key` 값 검색 → Vercel env `BIZINFO_API_KEY` 등록
2. **K-Startup API 키**: data.go.kr 에서 신규 발급 → Vercel env `KSTARTUP_API_KEY` 등록
3. /admin/dedupe 접속 → 중복 후보 검토 (첫 cron 실행 후 24h 내)

---

**Why:** B1 으로 신규 정책 출처 2종 추가 (~수백건/주), B3 으로 사용자에게 중복 노출 사고 차단. B2 는 keepio_agent 중복 위험으로 보류 — 후속 phase 에서 재검토.

**How to apply:** B1·B3 독립이라 task 1 (bizinfo) → task 2 (kstartup) → task 3 (dedupe) 순차 진행. 각 task 별 spec + quality reviewer + 핫픽스 + push 패턴.
