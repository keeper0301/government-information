# 어드민 페이지 Inventory — 2026-05-07

마스터 로드맵 sub-project #1 산출물.
연관: `docs/superpowers/specs/2026-05-07-admin-automation-master-design.md` § 3.1.

## 1. 전체 페이지 현황 (25 페이지)

| # | 경로 | 목적 | 자동화 수준 | 사장님 수동 작업 | Cron 연결 | 자동화 가능성 | 소요 |
|---|---|---|---|---|---|---|---|
| 1 | `/admin` | 메인 대시보드 | ℹ️ 조회용 | 사용자 검색 form | — | ⭐⭐⭐ | 1h |
| 2 | `/admin/news` | 뉴스 수집 운영 | ⚠️ 부분 | 수동 트리거 + 비공개 토글 | `collect-news` (cron) | ⭐⭐⭐ | 2h |
| 3 | `/admin/dedupe` | 중복 정책 검토 | ⚠️ 부분 | confirm/reject 클릭 | `dedupe-detect` (cron) | ⭐⭐ | 3h |
| 4 | `/admin/blog` | 블로그 글 관리 | ℹ️ 조회용 | 수정 form 편집 | — | ✗ 불가 (창작) |
| 5 | `/admin/blog/[id]` | 블로그 글 편집 | ⚠️ 부분 | 제목/본문 수동 작성 | — | ✗ 불가 (창작) |
| 6 | `/admin/wordpress` | 워드프레스 자동 발행 | ✅ 완전 | 환경변수 설정만 | (간접 — `blog-publish` 후) | — | — |
| 7 | `/admin/naver-blog` | 네이버 블로그 큐 | 🔴 수동 | 복사·붙여넣기·발행 완료 | (간접) | ⭐ (캡차 위험) | 8h |
| 8 | `/admin/health` | 사이트 헬스 대시보드 | ℹ️ 조회용 | 이상 신호 링크 클릭 | `health-alert` (cron) | ⭐⭐⭐ | 1.5h |
| 9 | `/admin/alimtalk` | 알림톡 운영 현황 | ✅ 완전 | 테스트 발송 (선택) | (cron 발송) | ⭐⭐⭐ | 2h |
| 10 | `/admin/instagram` | 인스타 카드뉴스 | 🔴 수동 | 이미지 저장→인스타 업로드 | — | ⭐ (Meta API 제약) | 6h |
| 11 | `/admin/cron-failures` | cron 실패 알림 | ℹ️ 조회용 | 실패 원인 분석·retry | — | ⭐⭐ | 2h |
| 12 | `/admin/cron-trigger` | 모든 cron 수동 실행 | 🔴 수동 | 버튼 클릭 (여러 번) | (모든 cron) | ⭐⭐⭐ | 1h |
| 13 | `/admin/targeting` | 본문 분석 진행률 | ℹ️ 조회용 | curl 명령 복사→터미널 | `enrich-targeting` (cron) | ⭐⭐ | 2h |
| 14 | `/admin/alert-simulator` | 발송 대상 미리보기 | ℹ️ 조회용 | 정책 ID 입력→검색 | — | ⭐⭐⭐ | 1h |
| 15 | `/admin/press-ingest` | 광역 보도자료 후보 | ⚠️ 부분 | L2 confirm/reject + 등록폼 | `cron/press-ingest` × 3 | ⭐⭐ | 4h |
| 16 | `/admin/loan/new` | 대출 정책 수동 등록 | 🔴 수동 | form 입력 + 제출 | — | ✗ 불가 (창작) |
| 17 | `/admin/welfare/new` | 복지 정책 수동 등록 | 🔴 수동 | form 입력 + 제출 | — | ✗ 불가 (창작) |
| 18 | `/admin/users/[userId]` | 개별 사용자 상세 | ℹ️ 조회용 | 사용자 관리 액션 | — | ⚠️ 제한 |
| 19 | `/admin/wishes` | 사용자 요청사항 | ℹ️ 조회용 | 요청 확인·회신 | — | ✗ 불가 (사람 응답) |
| 20 | `/admin/insights` | 콘텐츠 insight | ℹ️ 조회용 | 분석 검토 | — | ✗ 불가 (분석은 조회 자체) |
| 21 | `/admin/business` | 비즈니스 현황 | ℹ️ 조회용 | KPI 모니터링 | — | ✗ 불가 (조회용) |
| 22 | `/admin/enrich-detail` | 공고 상세 보강 | ℹ️ 조회용 | 보강 데이터 검토 | `enrich` (5분 cron) | ⭐⭐ | 3h |
| 23 | `/admin/recommendation-trace` | 추천 로직 추적 | ℹ️ 조회용 | 추천 결과 분석 | — | ⭐⭐ | 2h |
| 24 | `/admin/my-actions` | 내 관리자 액션 로그 | ℹ️ 조회용 | 액션 기록 확인 | — | ⭐⭐⭐ | 1h |
| 25 | `/admin/news/backfill-dedupe-runner` | 뉴스 dedupe 백필 | 🔴 수동 | runner 실행 | — | ⭐⭐ | 2h |

**자동화 수준 분포**: ✅ 완전 8% / ⚠️ 부분 20% / 🔴 수동 24% / ℹ️ 조회용 48%.

## 2. 상위 5개 자동화 우선순위

선정 기준: 사장님 부담(클릭 빈도 × 소요시간) × 자동화 가능성 × 시스템 안정성.

| 순위 | 페이지 | 현재 부담 | 자동화 효과 | 구현 시간 | 핵심 위험 |
|---|---|---|---|---|---|
| **1** | `/admin/press-ingest` | 일 0~15분 (L2 confirm + 폼 prefill) | LLM confidence ≥ 0.90 자동 confirm | **4h** | 분류 오류 시 사용자 노출 — 안전망 #6 선결 |
| **2** | `/admin/cron-trigger` | 주 30~45분 (여러 cron 수동 클릭) | 실패 자동 재시도 (exponential backoff) | **1.5h** | 무한 retry 차단 (3회 cap + alert) |
| **3** | `/admin/dedupe` | 일 0~40초 (0.7~0.95 수동 검수) | 임계 0.95 → 0.85, 0.80 + LLM 2차 판단 | **3h** | 임계 잘못 낮춤 시 동일 정책 중복 노출 — 안전망 #6 선결 |
| **4** | `/admin/instagram` | 일 5분 (이미지 저장→인스타 업로드) | Meta API 자동 업로드 | **6h** | 비즈니스 계정 + API 제약 + 캡차 위험 |
| **5** | `/admin/naver-blog` | 일 15~45분 (복사·붙여넣기·발행) | (이미 SMS 알림 + prompt 복사 추가됨) | **8h+** | 캡차·약관 위반 — 24h 무인 자동 불가능 |

## 3. 빠른 승리 (Quick Win, 1시간 내)

| 작업 | 효과 | 위험 |
|---|---|---|
| `/admin/cron-trigger` "일괄 재시도" 버튼 추가 | 실패 cron 한 번에 재실행 (수주 효과 ↑↑) | 0 |
| `/admin/alert-simulator` 정책 ID 자동 감지 | 정책 ID 입력 form 자동 채움 | 0 |
| `/admin/targeting` curl 명령 → "지금 실행" 버튼 | 터미널 작업 ↓ | 0 |
| `/admin/my-actions` 자동 정리 (오래된 로그 archive) | 페이지 로드 빠름 | 0 |
| `/admin/health` 이상 신호 → 자동 link | 사장님 진입 즉시 처리 | 0 |

## 4. 자동화 불가능 영역 (창작·사람 판단)

- `/admin/blog`·`blog/[id]`·`/welfare/new`·`/loan/new` — 콘텐츠 창작 (사람만 가능)
- `/admin/wishes` — 사용자 요청 회신 (사람 응답 필요)
- `/admin/insights`·`/admin/business` — 분석 조회용 (자동화 대상 X)

## 5. 이미 자동화된 영역 (변경 불필요)

- `/admin/wordpress` — 자동 발행 + 검증 트리거 (commit `e403121`·`84bd4b6`)
- `/admin/naver-blog` — SMS 알림 + 일괄 발행 prompt 복사 (commit `f8ebc6c`)
- `/admin/health` — 자동 cron + SMS alert
- `/admin/alimtalk` — 자동 발송 cron
- 뉴스 수집 cron (매일 KST 11:00 + 광역 17개)
- Dedupe ≥ 0.95 자동 confirm
- IndexNow 색인 자동 ping (KST 16:30)

## 6. 마스터 로드맵 sub-project 매핑

| 본 inventory 발견 | 마스터 로드맵 sub-project |
|---|---|
| 1순위 (press-ingest) → 임계치 자동화 | #3 (LLM 임계 낮추기) — 안전망 #6 후에 |
| 2순위 (cron-trigger) → cron 자동 재시도 | #5 (cron 자동화) |
| 3순위 (dedupe) → 임계 학습 확대 | #3 (LLM 임계 낮추기) |
| 4·5순위 (instagram, naver-blog) | 마스터 로드맵 비목표 (자동화 불가능) |
| 빠른 승리 5건 | #4 (통합 알림) 와 #5 에 분산 |

## 7. 다음 단계 추천

**즉시 시작 (위험 0)**: 빠른 승리 5건 중 `/admin/cron-trigger` "일괄 재시도" 버튼 — 1시간 안에 마무리 가능.

**다음**: 마스터 로드맵 #2 (다이제스트 강화) → 사장님 어드민 진입 빈도 ↓ 80% 의 핵심.

**중장기 (안전망 후)**: #3 임계 낮추기. 1순위 (press-ingest) + 3순위 (dedupe) 가 동시 적용 대상.
