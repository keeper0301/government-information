# 공개 전 검수: 최소 로컬 수정 결과

2026-10-13. 로컬 코드·모의 테스트 결과이며 배포 승인이나 운영 데이터 검증이 아니다. 이전 보고서/patch의 광범위한 비공개 전환 및 집계 변경을 대체한다.

## 작업 기준과 보존

- 격리 clone: `C:/Users/cgc09/Documents/Codex/2026-10-13/task/quality-gate`
- 브랜치: `codex/prepublish-quality-gate-20261013`
- base SHA: `82165673e108c424d65cf1bd06941477bf5be5e6`
- 기존 `C:/Users/cgc09/projects/government-information` checkout의 health route 수정과 미추적 테스트를 보존했다. 원본의 브랜치·작업 내용을 변경하지 않았다.
- AGENTS, 기존 테스트 지침, Next 문서를 먼저 확인했다. 저장소 `.agents/skills`는 없었다. 지원 memory_summary에서 관련 이력을 찾지 못해 근거로 사용하지 않았다.
- PR #365 head `e1ba3b14a5fa5b62f2bf19362656c326d0b8e3c3`를 읽기 비교했다. base 대비 17개 파일이며 직접 변경 파일 중복은 없다. 통계 정의 차이는 별도 사항이다. PR·review mode 설정은 변경하지 않았다.
- 주어진 운영 증거는 실행 38339442683/job115106893632, WP18785의 score=4/needsReview=false/미완성 N만원 공개다. 실행 재시도나 공개 글 수정·숨김은 하지 않았다.

## 변경 범위

1. `lib/blog-publish.ts`: 검수 전 초안을 `published_at=null`, 검수 필요 상태로 저장한다. 전체 공개 필드를 검수하고 동일 updated_at의 초안 1행이 승인 저장됐을 때만 내부 공개·외부 전송으로 진행한다. DB 오류·0행·예외는 발행하지 않는다.
2. `lib/blog/publication-eligibility.ts`: 금액 placeholder를 결정적으로 검사한다. 제목·전체 본문·메타·태그·FAQ·카테고리·커버 필드를 검사하며, HTML 속성/태그 경계·숫자 엔티티·전각/제로폭 문자를 처리한다. 정상 숫자와 N년/NH/NCS/ANN은 허용한다.
3. `lib/blog/quality-check.ts`, `lib/blog/quality-gate.ts`, `lib/ai.ts`: 본문 일부만 검수하던 제한과 N만 원 예시를 제거했다. 잘못된 응답 구조·점수·미완성 금액을 보류한다. 발행/재검수/공개본 교체는 명시적으로 failClosed=true다. 무관한 기본 호출의 전송/파싱 예외 중립값 계약은 유지했다. 이 중립값을 공개 승인으로 사용하는 새 경로는 만들지 않았다.
4. 블로그 detail/metadata/list/category, 카테고리 허브, 추천/검색/홈, RSS/sitemap, OG·이미지·IndexNow: 후보 SQL 조건 이후 전체 공개 필드로 isBlogReadable을 검사한다. 알려진 보류 플래그와 placeholder를 조회에서 제외한다.
5. WP publisher 및 Naver enqueue/cron/extension/candidate/raw publisher: 신규 외부 전송은 검수 완료 상태와 전체 공개 필드 검사를 요구한다. WP는 최신 canonical row 확인 후 기존 claim 로직으로 진행한다. legacy 조회 호환성을 외부 전송에 적용하지 않았다.
6. 관리자 저장과 `lib/blog/prepare-save.ts`: 변경 없는 저장은 검수를 생략한다(빈 태그 []/null 동등). 정상 공개본 수정은 최신 전체 필드+폼 변경을 먼저 검수하고 CAS로 교체하며 published_at을 유지한다. 검수 실패·예외·stale 화면·DB 오류·0행이면 현재 공개본을 덮어쓰지 않는다. 초안/보류 저장은 승인·공개하지 않는다. 명시적 공개는 검수 완료를 요구하며 수동 승인도 placeholder를 우회하지 못한다.

집계 전용 `lib/category-counts.ts`, `app/about/page.tsx`, 카테고리 OG 변경은 철회했다. 기존 RPC/집계는 유지하며 별도 문서 `../category-counts-followup-20261013.md`에 개선 필요만 기록했다.

최종 변경은 41파일(제품 코드 27, 테스트 11, 오프라인 검사 도구 2, 결과 문서 1)이다. 전체 파일 목록과 diff는 `../prepublication-quality-minimal-20261013.patch`에 포함된다. 기존 원본 checkout의 dirty 파일 2개가 그대로임을 마지막에 다시 확인했다.

## 레거시 호환성의 정확한 범위

- 읽기만 허용하는 legacy 상태: 이미 published_at 있음 + admin_review_required=false + admin_reviewed_at=null + admin_review_score=null + 모든 공개 필드 선택됨 + placeholder 없음.
- 검수 기록이 있는 정상 글은 기존 승인 상태로 읽힌다. 검수 필요=true, 미공개, 완료시간 없는 점수 기록, 누락된 필드, placeholder는 허용하지 않는다.
- 신규 공개·WP/Naver는 legacy 예외 없이 admin_reviewed_at을 요구한다.
- migration 079의 기본값은 과거 정상 글과 검수를 건너뛴 행을 구별할 수 없다. 과거 잘못된 응답이 정상 승인처럼 저장된 경우도 별도 이력이 없으면 구별할 수 없다. 이 호환성은 역사적 검수 완료를 인증하지 않는다. provenance/status migration이나 운영 정리가 필요하다면 별도 승인·설계가 필요하며 이번에는 적용하지 않았다.

## 검증 기록

운영 .env/자격증명을 가져오지 않고 최소 환경 변수만 전달했다. DB/LLM/WP/Naver는 mock이다. Node socket/HTTP(S)/DNS/fetch와 비허용 하위 프로그램·shell을 차단했다. Windows Vite의 `net use` 탐색은 빈 fixture를 반환하며 실행하지 않는다. esbuild와 Node만 도구 체인으로 허용했다.

| 검사 | 실제 결과 |
|---|---|
| 최초 수정 전 재현 | 21개 중 14 실패, 7 통과 |
| 동일 base 비교: 품질/WP/생명주기 | 4파일 57개 중 32 실패, 25 통과 |
| legacy 호환 재현, 수정 전 | 11개 중 1 실패, 10 통과 |
| 최종 관련 회귀 | 33파일, 283 통과, 0 실패 |
| 전체 suite 첫 시도 | 586파일: 580 통과/2 실패/4 skip; 3943개: 3921 통과/3 실패/19 skip, unhandled error 1 |
| 전체 안전 범위 재검사 | 587파일: 583 통과/4 skip; 3953개: 3935 통과/18 skip; 실패·unhandled error 0, exit 0 |
| TypeScript | 오류 0, exit 0 |
| 변경 TS/TSX/CJS ESLint | 40파일, 오류·경고 0, exit 0 |

첫 전체 실패 중 메타데이터 3개는 새 조회 체인/전체 행을 지원하도록 기존 mock을 수정했다. 영상 파일 `__tests__/lib/instagram-reel-video-render.test.ts`는 FFmpeg 실행과 Satori 네트워크가 차단돼 실패했으며 보호를 풀지 않았다. 두 번째 전체 검사에서는 이 파일만 제외했다. 기존 skip은 유지했다. production build/SSG, 브라우저 E2E, 실제 Postgres RLS/CAS, 외부 전송은 미실행이다.

명령:
- `node tools/test-prepublication-offline.cjs`
- `node tools/test-prepublication-offline.cjs --all --maxWorkers=4 --exclude=__tests__/lib/instagram-reel-video-render.test.ts`
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`
- 변경된 TS/TSX/CJS 파일을 로컬 ESLint로 검사.

로그는 상위 task 폴더의 `minimal-red.log`, `minimal-regression.log`, `minimal-full-suite.log`, `minimal-full-suite-safe.log`, `minimal-types.log`, `minimal-lint.log` 및 이전 `red-tests.log`, `baseline-red.log`이다.

## 독립 리뷰

별도 에이전트가 HEAD 대비 코드와 테스트를 읽기 검토했다. 추천 필터의 뉴스 오적용/블로그 누락(P1), 빈 태그 표현으로 불필요한 검수 발생(P2)을 발견했다. 둘 다 수정하고 정상 뉴스·블로그 score/fallback 및 빈 태그 테스트를 추가했다. 재검토 결과 추가 차단 결함을 발견하지 않았다고 보고했다. 이는 로컬 코드 리뷰이며 운영 승인이나 테스트 실행 확인은 아니다.

## 남은 조건·운영 적용 금지

- migration 001의 blog_posts SELECT USING(true)와 006 이후 정책에서 초안 비공개를 보장할 근거가 없다. 실제 운영 RLS/role/grants/API exposure는 조회하지 않았다. 조건에 따라 anon/authenticated REST에서 초안이 노출될 수 있어 애플리케이션 필터만으로 전체 목표를 보장할 수 없다. RLS 상태 확인 및 별도 migration 설계가 배포 전 필수다. 이번 patch는 migration을 포함하지 않는다.
- 필터가 SQL limit/range 이후 적용돼 페이지/추천이 짧거나 비고 총수와 차이 날 수 있다. 집계 RPC·about·카테고리 숫자는 기존 정의를 유지한다. 이 문제를 대량 전체본문 집계로 우회하지 않았다.
- 기존 캐시/CDN/검색엔진 사본, 이미 발행된 WP/Naver 글은 이 로컬 작업으로 바뀌지 않는다. 운영 WP18785/WP18685는 수정하지 않았다.
- 검수 보류 초안을 자동 복구·재발행하지 않는다. 수동 검수/내부 공개와 외부 전송 재시도는 별도 절차다. 자연 실행의 부분 성공·70초 timeout 때문에 전체 재실행은 금지 상태다.
- CAS와 WP claim은 외부 API까지 하나의 트랜잭션을 만들지 않는다. 검수 후 다른 writer/외부 전송 사이 경쟁과 전송 결과 불확실성은 남는다. source 단위 DB uniqueness 없이 정확히 한 번 실행도 보장하지 않는다.
- push/PR/병합/배포/운영 DB/실수집·발행·재시도/계정·권한/AdSense 재심사는 수행하지 않았다. Google 거절 사유는 미확인이며 심사 승인 보장은 없다.
