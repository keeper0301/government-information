# Goal Prompt — keepioo Supabase 강화·최적화 (기술 부채 해소)

> 다른 AI 세션/에이전트에게 그대로 전달하는 **자기완결 작업 지시문** (zero context 가정).
> 작성 2026-06-03. keepioo 는 **Supabase 단일 시스템 유지 확정** (Convex 전환 보류 — `CONVEX_MIGRATION_GOAL_PROMPT.md` 참고).
> 이 문서는 현재 Supabase 스택의 **보안·성능 기술 부채를 Supabase advisor 기반으로 우선순위 해소**하는 작업.

---

## 0. 목표

keepioo.com Supabase 스택의 보안·성능 기술 부채를 **Supabase advisor(security/performance 자동 진단)** 기준으로 우선순위대로 해소한다. **무중단 · 회귀 0 · prod DDL 명시 승인.**

## 1. 현재 스택 (측정 2026-06-03)

- **Next.js** — ⚠️ 수정판. `node_modules/next/dist/docs/` 먼저 읽기. `AGENTS.md` 참고.
- **Supabase**: 마이그레이션 105, 테이블 42, RLS 정책 96, 호출 파일 311
- **Vercel**: cron 71, 라우트 211
- **품질**: 테스트 296 통과, eslint 0, tsc 0 (2026-06-03 /health 10/10)
- **도메인**: 정책(welfare_programs·loan_programs)·뉴스(news_posts, local-press 80+ collector)·블로그·사용자(맞춤 알림·자가학습)·어드민
- **DDL 경로**: `scripts/apply-migration.mjs` (Management API, `.env.local` 의 `SUPABASE_ACCESS_TOKEN`)

## 2. advisor 진단 (2026-06-03 — ⚠️ 시작 전 `get_advisors` 재실행 필수, 상태 변동)

### Security
- 🔴 **ERROR 1** — `district_dictionary` RLS 비활성 (public schema 노출 → anon 읽기/쓰기 가능). **즉시 처리.**
- 🟡 **WARN 2** — `increment_rate_limit`·`increment_view_count` 가 `SECURITY DEFINER` 인데 anon/authenticated 가 `/rest/v1/rpc/` 로 실행 가능 (권한 상승 위험).
- 🔵 **INFO 16** — RLS enabled no policy (RLS 켜졌으나 정책 없음 = 사실상 전체 차단, 안전하나 의도 명시 권장): admin_actions·press_ingest_candidates·push_subscriptions·sidecar_state·rate_limits 등.

### Performance
- 🟡 **WARN 3** — `auth_rls_initplan`: `push_notification_log`·`push_user_preferences` RLS 정책이 `auth.<fn>()` 를 행마다 재평가 → `(select auth.<fn>())` 로 수정 (대규모 시 성능).
- 🔵 **INFO 10** — unindexed FK: loan/welfare_programs `revoked_by`·naver_blog_queue·naver_publish_audit·press_ingest_candidates·support_tickets 등 covering index 없음.
- 🔵 **INFO ~22** — unused index: welfare/loan `keywords_gin`·policy_guides·push_notification·decision_pending 등 미사용 (제거 후보, **단 신중**).
- 🔵 **INFO 1** — auth db connections 절대(10) → 퍼센트 전략 권장.

## 3. Phase (우선순위 — advisor 등급순)

- **Phase 1 — 보안 긴급 (P0/P1)**
  - `district_dictionary`: 용도 확인(행정구역 사전 = 읽기 public 의도?) → RLS 활성 + `select` 정책(anon 읽기 허용 or service_role only) + 쓰기 차단.
  - `increment_rate_limit`·`increment_view_count`: anon 호출이 의도인지 확인 → 의도면 유지(주석)·아니면 `SECURITY INVOKER` 전환 또는 `EXECUTE` revoke.
- **Phase 2 — 성능 WARN**
  - `auth_rls_initplan` 3건: `push_notification_log`·`push_user_preferences` RLS 정책의 `auth.<fn>()` → `(select auth.<fn>())` 교체 (마이그레이션).
- **Phase 3 — INFO 정리 (신중, 저ROI 가능)**
  - RLS no policy 16: 테이블별 의도(service_role only) 확인 → 명시 정책 추가 또는 "의도적 차단" 문서화.
  - unindexed FK 10: covering index 추가 (단 admin/audit FK 는 저빈도면 보류 판단 — 추가가 쓰기 비용).
  - unused index ~22: **사용 패턴 확인 후** 제거 (⚠️ `keywords_gin` 미사용 = full-text 미사용 신호일 수 있음 — 검색 코드 확인 후. 최근 추가 인덱스는 통계 부족일 수 있어 즉시 제거 금지).
  - auth db connections: 퍼센트 전략 (Supabase 대시보드).
- **Phase 4 — full-text 검색 점검**: 정책/뉴스 검색 인덱스·쿼리 성능 (Phase 3 unused gin 과 연계).
- **Phase 5 — 마이그레이션 정리(선택)**: 105개 통합/문서화 — ROI 낮으면 생략.

## 4. 작업 원칙 (불변)

1. **무중단** — AdSense·cron 71 가동 중. DDL 은 lock·rewrite 영향 확인.
2. **회귀 0** — 기존 296 테스트 통과 유지. RLS 변경 시 해당 API 라이브 검증.
3. ⚠️ **prod DDL 명시 승인** — Supabase DDL apply 시 사장님의 **"승인"/"apply"/"테이블 정책 적용 승인"** 같은 명시 표현 필요. "ok"/"확인" 같은 일반 답은 시스템이 거부 (메모리 `feedback_prod_ddl_explicit_approval`).
4. **advisor 재검증** — 각 Phase 후 `get_advisors` 재실행해 ERROR/WARN 감소 확인.
5. ⚠️ **RLS 변경 신중** — 잘못하면 데이터 노출(과소) 또는 정상 기능 차단(과다). 각 테이블의 실제 접근 주체(anon 읽기 / authenticated 본인 / service_role only)를 코드(`lib/supabase`)에서 확인 후 정책 작성. **넓은 정책 금지.**

## 5. 검증 기준

- advisor: **ERROR 0 + WARN 0** 목표 (INFO 는 의도적 잔존 허용 — 문서화)
- 기존 296 테스트 통과 + RLS 변경 테이블 API 라이브 검증
- 기능 패리티: 정책 검색·맞춤 알림·뉴스·블로그·어드민 동일 동작
- 성능: 검색·목록·상세 응답 시간 동등 이상 (인덱스 변경 전후 비교)

## 6. 제약 · 소통

- 사장님 **1인 운영 · 비개발자 · 한국어** (커밋·PR·설명·문서 한국어, 기술 용어 괄호 설명)
- `master` 직접 커밋·푸시 (PR 없음). destructive(force push·reset) 만 명시 확인.
- **push 전 code reviewer subagent 리뷰 필수**.
- `AGENTS.md` + `CLAUDE.md`(skill routing·git workflow·Health Stack) 준수.
- DDL: `scripts/apply-migration.mjs` + 명시 승인.

## 7. 첫 작업 (착수 순서)

1. `AGENTS.md` + `CLAUDE.md` 읽기
2. `get_advisors` (security + performance) **재실행** — 최신 부채 확정 (위 2번은 2026-06-03 스냅샷)
3. **Phase 1** `district_dictionary` RLS + SECURITY DEFINER 함수 2건 — 코드에서 실제 용도 확인 → 마이그레이션 초안 → **사장님 명시 승인** → apply → advisor 재검증
4. 각 Phase 끝에 사장님 리뷰 + advisor 재실행 보고
