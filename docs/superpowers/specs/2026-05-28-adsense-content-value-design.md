# AdSense 자체 콘텐츠 가치 강화 — 통합 설계

작성일: 2026-05-28
관련: AdSense 3번째 거절 ("가치가 별로 없는 콘텐츠", 5/10·5/18·5/28 반복) 대비.
review mode([[project-keepioo-adsense-review-mode-2026-05-28]])는 news 섹션을 숨기는 방어책이고,
본 설계는 자체 콘텐츠 가치를 직접 끌어올리는 공격책이다.

## 목표

4번째 거절을 차단하기 위해 keepioo 의 자체(non-외부) 콘텐츠 가치를 세 영역에서 강화한다.
세 영역은 **독립 entry point + 독립 data path** 를 가져 한 영역의 사고가 다른 영역으로 번지지 않는다.

## 범위

| 영역 | Entry | Data path | 비용 |
| --- | --- | --- | --- |
| 1. 정책 상세 자체 가치 박스 | 사장님 수동 trigger (백필 endpoint) | OpenAI gpt-4o-mini → DB column → SSR | ~$1.8 일회성 |
| 2. blog 본문 강화 | 기존 cron (GitHub Actions) | prompt 개선 + quality-gate 임계치 ↑ | 0 (기존 cron) |
| 3. /help 시나리오 가이드 | 정적 SSG | 코드만 | 0 |

---

## 영역 1: 정책 상세 자체 가치 박스

11,000+ welfare/loan 상세 페이지([id])에 자체 작성 가치 박스를 추가한다.
현재 자체 가치 콘텐츠 거의 0건 → AdSense "가치 콘텐츠" 평가에 가장 직접 영향.

### 데이터 모델

마이그레이션 `supabase/migrations/<next>_policy_ai_guides.sql`
(번호 vs 날짜 컨벤션은 구현 시 기존 폴더 최신 파일 확인 — 현재 103 + 날짜형 혼재):
- `welfare_programs` 와 `loan_programs` 각각에 컬럼 3종 추가 (nullable TEXT):
  - `ai_tips` — 「이용 팁」 (이 정책을 활용하면 좋은 경우·실용 팁)
  - `ai_faq` — 「자주 묻는 거절 사유」 (신청 시 흔한 탈락 원인·주의점)
  - `ai_checklist` — 「신청 체크리스트」 (신청 전 확인 항목)
- nullable → 백필 안 된 row 는 NULL, PolicyGuideBox 가 template fallback.

### 컴포넌트

- `lib/policy/ai-guide.ts` — OpenAI gpt-4o-mini 호출 helper.
  - 입력: 정책 title + summary + category + 대상.
  - 출력: `{ tips, faq, checklist }` 3 필드 (각 100~200자, 한국어).
  - sanitize: HTML 태그 제거, 길이 cap, 한국어 미포함 시 null 반환.
  - 기존 `lib/llm/text.ts` 추상화 재사용 (provider 단일 진입점, [[project-keepioo-llm-full-migration-2026-05-10]]).
- `app/api/admin/backfill-policy-ai-guides/route.ts` — 사장님 trigger 백필.
  - 인증: 기존 admin API key 패턴.
  - batch=50, ai_* 컬럼 중 하나라도 NULL 인 row 만 대상 (idempotent).
  - 파라미터: `type` (welfare/loan/both), `limit` (sample 검증용).
- `components/policy/PolicyGuideBox.tsx` — SSR 컴포넌트.
  - ai_tips/ai_faq/ai_checklist 가 있으면 3 섹션 렌더.
  - 모두 NULL 이면 카테고리별 template 안내 박스 fallback (중복 콘텐츠 위험 인지하되 0보다 나음).

### 데이터 흐름

1. 사장님이 `backfill-policy-ai-guides?type=welfare&limit=10` 호출 → 첫 10건 sample.
2. 사장님 검수 (검증 게이트).
3. 사장님 명시 승인 후 `limit` 없이 전체 호출 → 50건 batch × N → 약 50분.
4. 다음 SSR 부터 welfare/loan 상세에 PolicyGuideBox 자동 노출.

### 에러 처리

- AI 호출 실패 → 컬럼 NULL 유지 → template fallback.
- backfill 중단 → 다음 호출 시 NULL row 부터 재개 (idempotent).
- OpenAI rate limit → batch 간 지연 (4건/초 마진).

### 검증 게이트 (설계 핵심)

전체 11K 백필 전 **반드시 sample 10건 → 사장님 검수**.
AI 결과 품질이 낮으면 prompt 조정 후 재검수. 사장님 명시 승인 후에만 전체 백필.

---

## 영역 2: blog 본문 강화

### 수정

- `lib/blog-publish.ts` — 생성 prompt 강화.
  - 본문 4 구조 의무화: ①도입(왜 중요한가) ②적용 시나리오(누가·언제) ③신청 체크리스트 ④공식 원문 확인 항목.
  - 목표 분량 3,000~4,000자 (현재 평균 1,950자).
- `lib/blog/quality-gate.ts` — 최소 길이 임계치 1,500 → 2,500자.

### 데이터 흐름

- 다음 cron 발행분(GitHub Actions 06:07/22:07 UTC)부터 자동 적용.
- 기존 13,000+ 발행글 미수정 → 누적 SEO 신호 보호.

### 에러 처리

- 임계치 상향 → 발행 fail 늘 위험. prompt 강화로 보상. 1주 모니터링 후 임계치 미세 조정 여지.

---

## 영역 3: /help 시나리오 가이드

### 수정

- `app/help/page.tsx` — SECTIONS 배열에 "상황별 이용 가이드" 섹션 추가.
  - 시나리오 3종 step-by-step:
    1. 처음 사용하는 분 — 가입 → 프로필 입력 → 맞춤 추천 받기.
    2. 60대 부모님 대신 신청 — 조건 입력 → 마감 알림 → 공식 사이트 안내.
    3. 소상공인 — 업종 입력 → 대출·지원금 자격 진단 → 신청.

### 데이터 흐름

- 정적 SSG, 다음 deploy 후 즉시 노출.

---

## 비용·시간

- AI: 11,755건 × ~250 token output × gpt-4o-mini ($0.6/1M) ≈ **$1.8 일회성**.
- 시간: 백필 약 50분 (자동). 다른 두 영역 즉시.

## 테스트

- `lib/policy/ai-guide.ts` — prompt 출력 sanitize (HTML 제거·길이 cap·한국어 미포함 null).
- `components/policy/PolicyGuideBox.tsx` — ai_* 있을 때 3 섹션 / NULL 일 때 template fallback.
- `app/api/admin/backfill-policy-ai-guides` — auth 거부 · batch idempotent (이미 채운 row skip).
- `lib/blog/quality-gate.ts` — 2,500자 미만 reject · 이상 통과.

## 비목표 (YAGNI)

- 기존 발행 blog 글 재생성 (SEO 신호 초기화 위험 → 제외).
- 정적 시나리오를 독립 URL(/guides/*)로 분리 (구조 변경 폭 큼 → 이번 범위 외, 효과 검증 후 별도).
- 새 정책 자동 ai-guide 생성 cron (백필 효과 검증 후 별도 도입).
- 정책 상세 자체 가치 박스를 template-only 로 (중복 콘텐츠 시그널 위험 → AI combo 채택).

## 완료 기준

- [ ] policy_ai_guides 마이그레이션 prod apply (사장님 명시 승인).
- [ ] backfill endpoint sample 10건 → 사장님 검수 통과.
- [ ] 전체 11K 백필 완료 (사장님 승인 후).
- [ ] welfare/loan 상세에 PolicyGuideBox 노출 확인.
- [ ] blog 다음 발행분 3,000자+ · quality-gate 2,500 통과 확인.
- [ ] /help 시나리오 3종 prod 노출 확인.
- [ ] 단위 테스트 4종 통과 · 전체 vitest fail 0.
