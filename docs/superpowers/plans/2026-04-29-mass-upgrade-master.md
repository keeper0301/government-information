# keepioo 대규모 업그레이드 마스터 plan (2026-04-29)

> **For agentic workers:** 본 마스터는 phase 별 plan 으로 분기. 각 phase 시작 시점에 별도 task plan 작성 후
> superpowers:subagent-driven-development 또는 superpowers:executing-plans 로 실행.

**Goal:** 사장님 후보 14개 (D3 제외 13개) 를 6 phase 로 묶어 단계적 업그레이드. 운영 안전망 → 트래픽 유입 → 데이터 품질 → 사용자 가치 → 마케팅 채널 → 수익화 순서.

**Architecture:** 각 phase 는 독립적으로 master 에 push 가능. 의존성 적은 안전망 (Sentry/CI) 을 먼저 깔아 후속 작업 사고 인지 가능. 트래픽·데이터·UX·수익은 병렬로 진행 가능하나 ROI 순으로 phase 분리.

**Tech Stack:** Next.js 15 / Supabase / Sentry / GitHub Actions / Resend / AdSense / TossPayments / Anthropic Haiku.

---

## Phase 개요 (전체 약 43~46h, 6 phase)

### ✅ Phase 1: 운영 안전망 (완료 2026-04-29, 4 commit `e5f653a`~`4bb6a0c`)
- **D1** Sentry 에러 모니터링 (2h) ✅
- **D2** GitHub Actions CI 자동화 — vitest + tsc on PR/push (1h) ✅

이유: 후속 phase 에서 사고 발생 시 즉시 인지. 모든 phase 공통 인프라.
사장님 외부 액션 대기: Vercel env 5종 (`SENTRY_DSN` 등) 등록.

### ✅ Phase 2: 트래픽 유입 1 — SEO 확장 (완료 2026-04-29, 4 commit `b46f1f0`~`277da5d`)
- **A1** SEO long-tail 페이지 확장 (연령 5종 × welfare/loan = 10건) ✅
- **A2** 카테고리 hub 페이지 (청년/노년/자영업/주거 4종, /c/[category]) ✅

이유: 메모리 모든 곳에 "트래픽 부족" 운영 이슈. AdSense 승인 가능성 ↑.

### ✅ Phase 3: 데이터 품질 (완료 2026-04-29, 4 commit `34a5f2d`~`857ceb1`)
- **B1** kstartup·bizinfo collector ✅ (이미 prod 운영 중 → 단위 테스트 39 case 보강으로 적응)
- **B3** welfare/loan 중복 정책 dedupe ✅ (알고리즘 + cron + admin 검수 + 사용자 노출 차단)
- **B2** LLM 가이드 자동 생성 — keepio_agent 중복 위험으로 **Phase 3 제외**, 후속 검토

이유: 트래픽 들어왔을 때 콘텐츠 풍부도 = 체류 시간·전환 ↑.
DDL 0 — 기존 duplicate_of_id 컬럼 (007/046) 활용.

### ✅ Phase 4: 사용자 가치 — 재방문 trigger (완료 2026-04-29, 4 commit `b19e5f1`~`b992256`)
- **C2** 마이페이지 보강 (알림 history 필터·페이지네이션 + 즐겨찾기 정렬·필터, DDL 0) ✅
- **C1** /compare 확장 (즐겨찾기 자동 추천 + form UX) ✅
- **C3** PWA service worker (offline + push 1단계 + /mypage·/admin 캐시 제외 가드) ✅

이유: 트래픽이 있어도 재방문 없으면 의미 없음.
신청 트래킹 (DDL 필요) 은 보류, 다음 phase 검토.

### Phase 5: 트래픽 유입 2 — 마케팅 채널 (7h)
- **A4** 주간 정책 다이제스트 이메일 (Resend) (3h)
- **A3** Referral 시스템 — 가입 1명당 Pro 1주 (4h)

이유: 자체 마케팅 채널 확보. SEO 기반 트래픽과 시너지.

### Phase 6: 수익화 (6h)
- **E1** Pro 플랜 차별화 강화 (즉시 알림·수동 등록·고급 진단 등) (4h)
- **E2** AdSense 페이지별 manual 슬롯 최적화 (2h)

이유: 트래픽·재방문 들어왔으면 monetize.

---

## 의존성·순서 결정 사유

```
Phase 1 (안전망)
   ↓
Phase 2 (SEO 트래픽) ─── Phase 5 (마케팅 채널)
   ↓                      ↓
Phase 3 (데이터 품질)      ↓
   ↓                      ↓
Phase 4 (사용자 가치) ──── Phase 6 (수익화)
```

- Phase 1 은 모든 phase 의 사고 인지 인프라 → **반드시 먼저**.
- Phase 2 (SEO) 와 Phase 5 (이메일·referral) 는 트래픽 채널 분리. Phase 2 먼저 (SEO 효과 검증 시간 필요).
- Phase 3·4·6 은 트래픽이 들어온 후 가치를 키우는 작업. Phase 2 검증 후 진행.

---

## Phase 별 산출물·검증

| Phase | 산출물 | 검증 |
|---|---|---|
| 1 | Sentry config 2종 + CI workflow + env 5종 | 의도 에러 → Sentry 도달 / PR 체크 통과 |
| 2 | 신규 SEO 페이지 N개 + sitemap 업데이트 | Google Search Console submit / 색인 요청 |
| 3 | detail fetcher 2종 + dedupe migration + 가이드 자동 발행 | 카드 채움률 ↑ / dedupe view / 가이드 prod 노출 |
| 4 | 마이페이지 4 탭 + /compare UI + manifest.json + service-worker | 사용자 flow E2E / Lighthouse PWA 점수 |
| 5 | Resend cron + referral 시스템 | 테스트 발송 / referral 코드 생성 |
| 6 | tier feature flag + AdSlot 컴포넌트 | 결제 흐름 / 광고 노출 |

---

## 실행 흐름 (사장님 결정 포인트)

### 매 phase 시작 시
1. Claude 가 phase 별 task plan 작성 (`docs/superpowers/plans/2026-04-29-phase{N}-{name}.md`)
2. 사장님 plan 검토·승인
3. Claude 실행 (subagent-driven 또는 inline)
4. 각 task 완료 → 자체 검증 → reviewer subagent → master push
5. phase 완료 시 메모리 갱신 + 다음 phase plan 작성

### 외부 액션이 필요한 phase
- **Phase 1**: 사장님 Sentry 가입 + DSN 발급 → Vercel env 등록 (5분)
- **Phase 5**: Resend 도메인 인증 (이미 standby) — DNS 추가 필요
- **Phase 6**: 토스 가맹점 라이브 키 (이미 standby)

---

## Phase 1 진입 준비 — 별도 plan 파일

다음 파일에 Phase 1 상세 task plan 작성됨: `2026-04-29-phase1-ops-safety.md`.

작업 후 사장님 승인 → 실행.

---

**Why:** 14개 후보 모두 진행 결정 시 한 plan 으로 작성하면 100KB+ 분량이 되어 단일 세션 처리 불가. phase 단위 분기로 매 단계 사장님 검토 + 회귀 0 push 패턴 유지.

**How to apply:** master 는 6 phase 의 큰 그림·의존성·외부 액션 책임 분리 합의용. 실제 코드 작업은 phase 별 plan 에서 task 단위로.
