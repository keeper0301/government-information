# 사장님 PC headless 러너 — JS 렌더링 시·군 보도자료 수집 설계

작성: 2026-05-29 · 상태: 설계(구현 전)

## 1. 문제

정적 collector(`lib/scraping/local-press/`, Vercel cron icn1)로 본문을 못 가져오는 시·군이 남아 있다.

- **JS 렌더링형** (정적 HTML에 본문이 없음, JS/AJAX로 주입): 부산북구·기장·광주남구
- **elusive-static** (본문이 무클래스 span 조각 + 부서메뉴 혼재로 정적 분리 불가): 동래·김포·노원

이들은 정적 fetch + regex로는 본문 분리가 불가능하다(2026-05-29 진단 완료, [[project_local_press_body_fail_diagnosis_2026_05_28]]).

## 2. 근본 원인 — 한국 정부 사이트의 해외 IP 차단

- 한국 시·군청 사이트는 해외 데이터센터 IP를 차단한다.
- Vercel cron은 `icn1`(서울 리전)이라 정적 fetch는 통하지만, **headless 브라우저를 못 돌린다**(서버리스).
- 기존 GitHub Actions Playwright 러너(`.github/workflows/big-cities-press.yml`)는 매 6시간 정상 실행되지만, **미국 데이터센터 IP라 `page.goto`가 전부 타임아웃**(2026-05-29 로그 확인: 창원·천안·부산·수영·해운대 = `Timeout 30000ms`, 성남·안산 = list 0건). → 고유 7개 도시 누적 0건.
- 즉 "headless가 없다"가 아니라 **"한국 IP에서 headless를 돌려야 한다"**가 핵심 제약.

## 3. 의사결정 — 사장님 PC 상주 Playwright 러너

한국 IP 확보 방법 3안 중 **사장님 PC 상주 러너** 선택(2026-05-29 사장님 결정).

- 한국 가정 IP → 차단 없음. 추가 비용 0.
- 기존 자산 재사용: `playwright/runner.mjs` + `makeScraper` + `/api/admin/import-press-batch` 거의 그대로.
- 트레이드오프: PC를 켜둬야 함 + 과거 PC 러너 방치 이력([[project_keepioo_naver_extension_1week_idle_2026_05_18]]) → **idle 모니터링으로 완화**(4절).

## 4. 검증된 사실 (feasibility, 2026-05-29)

로컬(한국 IP)에서 기존 `makeScraper`로 6개 사이트 테스트:

- **노원 ✅ 완전 복구** (Playwright 렌더 후 본문 1637/1377자 깨끗) — "Playwright + 한국 IP + 기존 파이프라인" 이 동작함을 증명.
- 부산북구·동래: **list은 잡힘**(`table tbody tr`=10) → **body selector만 보강** 필요.
- 광주남구·김포: **list selector가 엉뚱한 요소를 잡음** → list selector 보강 필요.

→ 접근법 유효. 남은 작업은 사이트별 selector 튜닝(코드)뿐.

### 4.1 추가 검증 (2026-05-29) — selector 튜닝 규모

기존 GitHub Actions 7 도시를 **로컬(한국 IP)** Playwright 로 재실행:
- 전부 `page.goto` 는 성공(타임아웃 없음) → **IP 차단은 GitHub Actions(미국 IP) 한정**, 한국 IP 면 페이지 로드 OK 재확인.
- 그러나 창원·성남·안산·천안·수영·해운대 모두 `waitForSelector timeout`(makeScraper LIST_SELECTORS 미매칭) → 0건.

**결론:** 인프라·접근법은 유효하나, **makeScraper 범용 selector 가 맞는 건 노원뿐**이고
나머지 ~12 시·군(기존 큰 시 6 + 신규 5 + 부산북구 등)은 **사이트별 list/body selector
튜닝이 필수**다. 사이트당 Playwright DOM 조사 필요 = 반복 작업 규모 큼.

추가로 일부(부산북구=렌더 후에도 본문 DOM 부재, 동래=본문이 단일 요소로 안 모임,
김포=목록이 위젯 뒤섞임+bbsNo 상이)는 단순 selector 튜닝을 넘어 클릭/AJAX 트리거 등
사이트별 깊은 작업이 필요할 수 있어, 검증 통과분만 점진 등록한다.

### 4.2 현재 진행 (2026-05-29)
- 노원 ✅ PC 러너 경로로 이관 완료(commit 81ad0a7): cities.mjs/runner.mjs/import-press-batch
  등록 + 정적 _registry 비활성화(dual-path 방지).
- 나머지 ~12 시·군: 사이트별 selector 튜닝 대기(미착수).

## 5. 아키텍처

```
[사장님 PC] Windows Task Scheduler (예: 6h 간격)
   → node playwright/runner.mjs
       → makeScraper(각 시·군 listUrl) : chromium 렌더 → list + body 추출
       → POST /api/admin/import-press-batch  { city, items:[{title,sourceUrl,publishedDate,body}] }
[keepioo/Vercel] import-press-batch
   → PLAYWRIGHT_CITY_REGISTRY[city] 로 ministry/sourceCode 매핑
   → news_posts insert (source_url UNIQUE dedupe) → classified_at=null → 기존 분류 cron 진입
```

구성 요소(전부 기존 + 소폭 확장):
- `playwright/lib/cities.mjs` — 시·군 config 추가(listUrl + cityName).
- `playwright/lib/_factory.mjs` — `makeScraper` LIST/BODY selector 보강(사이트별).
- `playwright/runner.mjs` — COLLECTORS 배열에 추가.
- `app/api/admin/import-press-batch/route.ts` — `PLAYWRIGHT_CITY_REGISTRY` 에 city→ministry 추가.

## 6. dual-path 정리 (필수)

대상 시·군은 현재 정적 `_registry.ts`(CITY_REGISTRY)에 실패 collector로 등록돼 있다. PC 러너로 옮기면 **정적 등록을 제거**해야 한다([[feedback_dead_code_two_paths]] — 같은 도메인 두 경로 공존 금지). 같은 `source_code`(`local-press-<key>`) 유지 + source_url UNIQUE라 데이터 중복은 없으나, 정적 cron이 매일 0건 audit를 남겨 혼란 → 제거.

## 7. 운영 안전 — idle 모니터링

PC 러너가 멈추면 즉시 알림(과거 방치 이력 대비). 기존 패턴 재사용:
- import-press-batch 성공 시 audit(`admin_actions`) 기록 1건 추가(현재 없음).
- health-alert cron에 "PC 러너 N시간 무소식" 신호 추가 → 텔레그램 알림([[project_keepioo_naver_extension_1week_idle_2026_05_18]]의 idle-check 패턴).

## 8. 죽은 GitHub Actions 워크플로우 처리

`big-cities-press.yml`은 IP 차단으로 0건이며 매일 4회 헛돈다. PC 러너가 같은 도시(창원·성남·안산·천안·부산·수영·해운대)도 한국 IP로 복구 가능 → 이들도 PC 러너로 통합하고 **워크플로우는 비활성화(또는 삭제)**. 단일 JS 수집 경로로 일원화.

## 9. 범위

PC 러너가 맡을 JS/elusive 시·군:
- 신규 6: 부산북구·기장·광주남구·동래·김포·노원
- 기존 GitHub Actions(차단) 7: 창원·성남·안산·천안·부산·수영·해운대
- = 약 13개. 단, 사이트별 selector 검증 통과분만 등록(0건이면 보류).

## 10. 사장님 액션 (구현 후)

1. `playwright/` 의존성 설치(`npm install` + `npx playwright install chromium`) — setup 스크립트 제공.
2. Windows Task Scheduler 등록(6h 간격 `node runner.mjs`).
3. `KEEPIOO_API_URL` / `KEEPIOO_API_KEY`(=Vercel `IMPORT_PRESS_API_KEY`) 환경변수.

## 11. 리스크

- **PC 비가동**: idle 알림으로 가시화(7절). 근본적으로 사장님 PC 의존이라 한계 존재.
- **사이트별 selector 깨짐**: 격리됨(한 도시 selector 변경 시 타 도시 영향 0). makeScraper 공용 selector는 회귀 주의.
- **본문 junk**: BODY_SELECTORS가 메뉴/네비를 잡을 위험 → 사이트별 라이브 검증(본문 텍스트 육안 확인) 후 등록.

## 12. 검증 계획

- 각 시·군: 로컬 Playwright로 list+body 추출 → 본문 육안 확인(메뉴/파일/JS 혼입 없음) → 등록.
- import-press-batch: 기존 dedupe + sanitize(본문 50자+ 가드) 그대로.
- 등록 후 수동 1회(`node runner.mjs`) → news_posts insert 확인 → Task Scheduler 가동.
