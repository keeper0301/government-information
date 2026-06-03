# Goal Prompt — keepioo Supabase → Convex 전면 전환

> ⚠️ **2026-06-03 보류 (전면 전환 취소)** — 사장님 "Supabase 유지" 결정으로 전면 전환은
> 진행하지 않습니다. keepioo 는 **Supabase 단일 시스템 유지**가 확정 방향입니다. 이 문서는
> 미래에 Convex 를 다시 검토할 때 쓸 **참고 자료로만 보존**합니다 (실행 지시 아님).
> 재개하려면 측정값(마이그·테이블·cron 수)부터 재측정할 것.

> 다른 AI 세션/에이전트에게 그대로 전달하는 **자기완결 작업 지시문**입니다 (zero context 가정).
> 작성 2026-06-03. 측정값은 그 시점 기준 — 시작 전 재측정 권장.

---

## 0. 정체성 · 목표

당신은 **keepioo.com 백엔드를 Supabase(PostgreSQL) → Convex 로 전면 이관**하는 시니어 엔지니어다.
keepioo = 한국 정부 정책(복지·대출)·지자체 보도자료를 수집하고 사용자에게 맞춤 알림을 보내는 Next.js 서비스 (사장님 1인 운영).

**목표: 기능 패리티(parity) + 데이터 무손실 + 무중단 cutover.**

---

## 1. 현재 스택 (측정 2026-06-03)

- **Next.js** — ⚠️ 수정판이다. `node_modules/next/dist/docs/` 의 가이드를 먼저 읽고 코드를 쓸 것. `AGENTS.md` 참고.
- **Supabase**: 마이그레이션 **105**개, 테이블 **~40**개, RLS 정책 **96**개, Supabase 호출 파일 **311**개
- **Vercel**: cron **71**개, 라우트 **211**개 (page + route)
- **인증**: Supabase Auth (RLS 기반 권한)
- **검색**: PostgreSQL full-text (정책·뉴스 검색의 핵심)
- **도메인**:
  - 정책: `welfare`/`loan` (11,000+ row, AI 분류·본문 분석·매칭)
  - 뉴스: `news_posts` (local-press 80+ 지자체 collector + korea.kr + naver)
  - 블로그: 자동 발행 (Gemini)
  - 사용자: 맞춤 알림 규칙·온보딩·자가학습(popularity weights)
  - 어드민: 운영 대시보드(autonomous hub)·press-ingest·진단
- **외부 연동**: Resend(메일)·GA4·AdSense(가동 중)·토스(결제)·카카오 알림톡·Instagram·텔레그램 봇

## 2. 전환 원칙 (불변)

1. **무손실** — 11,000+ 정책/뉴스 row 100% 보존. export → import 후 row count + 샘플 + FK 무결성 검증.
2. **기능 패리티** — 기존 296+ 테스트 통과 유지 (회귀 0). 도메인별 동작 동일.
3. **점진 검증** — Phase 별 라이브 검증. cutover 전까지 Supabase 병행 운영.
4. **무중단** — AdSense·cron 71개 가동 중. 서비스 중단 최소화.
5. **Convex 공식 docs 우선** — training data 신뢰 금지. schema/functions/auth/search/cron 최신 문서 확인 후 작성.

## 3. 전환 매핑

| Supabase (현재) | Convex (목표) |
|---|---|
| PostgreSQL 테이블 40 | `schema.ts` 문서 모델 + 인덱스 |
| SQL 쿼리 (311 파일) | Convex `query`/`mutation`/`action` 함수 (TS) |
| RLS 정책 96 | Convex 함수 내부 auth/권한 체크 |
| Supabase Auth | Convex Auth 또는 Clerk |
| PostgreSQL full-text | Convex search index (부족 시 Algolia/Meilisearch 등 외부) |
| Vercel cron 71 | Convex cron(`crons.ts`) 또는 Vercel cron 유지 + Convex mutation 호출 |
| Supabase Management API (DDL) | Convex schema 코드 (마이그레이션 코드화) |
| 관계형 join (정책↔뉴스↔매칭↔users) | Convex 비정규화 + 함수 조합 재설계 |
| `@supabase/ssr`·`@supabase/supabase-js` | `convex`·`convex/react` |

## 4. Phase (단계 — 순차, 각 Phase 끝에 사장님 리뷰)

- **Phase 0 — 스키마 설계**: 105 마이그레이션 + `lib/supabase` 읽어 40 테이블·관계·RLS 96 매핑 → Convex 문서 모델 설계 문서 작성. 관계형→문서 비정규화 결정.
- **Phase 1 — 데이터 이관 검증**: Supabase export → Convex import 스크립트 + 무손실 검증(row count·샘플·FK). **여기까지 하고 계속 여부 재평가.**
- **Phase 2 — 함수 이관**: 311 호출을 도메인별 Convex query/mutation 으로 (정책 → 뉴스 → users → 어드민 순).
- **Phase 3 — 인증·권한**: Supabase Auth → Convex Auth/Clerk + RLS 96 → 함수 체크.
- **Phase 4 — 검색**: full-text → Convex search index. 정책/뉴스 검색 성능·정확도 검증 (부족 시 외부 검색).
- **Phase 5 — cron**: 71개 → Convex cron 또는 Vercel 유지 + Convex 호출. 무중단 전환.
- **Phase 6 — 라우트**: 211 라우트의 Supabase client → Convex client/hooks. 실시간 구독 활용처 식별.
- **Phase 7 — 병행 검증 + cutover**: Supabase vs Convex 결과 diff 일치 확인 → 트래픽 전환.
- **Phase 8 — 정리**: Supabase 제거, dead code/deps 정리, 문서 갱신.

## 5. 위험 · 주의 (반드시 사전 검증)

- ⚠️ **full-text search**: 정책/뉴스 검색이 PostgreSQL `pg_trgm`/full-text 의존. Convex search index 가 한국어 검색·성능을 충족하는지 Phase 4 전에 PoC. 부족하면 외부 검색 엔진 필수.
- ⚠️ **관계형 join**: 정책-뉴스-매칭-users 다대다가 많음. 문서 DB 는 join 약함 → 비정규화 설계가 데이터 정합성·중복 관리 부담.
- ⚠️ **회귀**: 296+ 테스트 패리티 + 도메인별 라이브 검증 필수. silent fail 주의.
- ⚠️ **데이터 무손실**: 11,000+ row export/import. timestamp·JSON 컬럼·enum 매핑 정확히.
- ⚠️ **무중단**: cron 71개 가동 중(보도자료 수집·알림·자가학습). 병행 운영 후 cutover.
- ⚠️ **vendor lock-in**: Convex 종속이 Supabase 보다 강함 (SQL 표준 이탈).

## 6. 검증 기준 (Phase 마다 충족)

- 기존 296+ 테스트 통과 + Convex 함수 단위 테스트 신규
- 기능 패리티: 정책 검색·맞춤 알림·뉴스 수집·블로그 발행·어드민 동일 동작
- 데이터 무손실: row count 일치 + 샘플 비교 + FK/관계 무결성
- 성능: 검색·목록·상세 응답 시간 동등 이상

## 7. 제약 · 소통 규칙

- 사장님 **1인 운영 · 비개발자 · 한국어**. 모든 커밋·PR·설명·문서 한국어 (기술 용어는 괄호 설명).
- `master` 직접 커밋·푸시가 표준 (PR 없음). destructive 작업(force push·reset 등)만 명시 확인.
- **push 전 code reviewer subagent 리뷰 필수**.
- `AGENTS.md`(수정 Next.js) + `CLAUDE.md`(skill routing·git workflow) 준수.
- ⚠️ **ROI 경고**: 전면 전환은 1인 서비스에 비용이 막대하다 (다중 세션 수백 시간 + 회귀 위험 + 검색 재설계 + 무중단 부담). **Phase 0~1(스키마 설계 + 데이터 이관 검증) 완료 후 "계속 vs 중단/부분전환" 을 반드시 재평가**할 것. 전면 cutover 가 정답이 아닐 수 있음.

## 8. 첫 작업 (착수 순서)

1. `AGENTS.md` + `node_modules/next/dist/docs/` 읽기
2. Convex 공식 docs (schema, functions, auth, search, cron, file storage) 확인
3. `supabase/migrations/` 105개 + `lib/supabase/` 읽어 40 테이블 + 관계 + RLS 96 매핑표 작성
4. **Phase 0 스키마 설계 문서** 작성 → 사장님 리뷰 → Phase 1 진행
