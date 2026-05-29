# 사장님 PC headless 러너 — JS 렌더링 시·군 보도자료 수집 설계

작성: 2026-05-29 · 상태: **GitHub Actions + icn1 프록시로 pivot, 노원 가동 완료(2026-05-29)**

> **결론 갱신(2026-05-29):** 사장님 PC 상주 대신 **무료 GitHub Actions(풀 chromium) + Vercel
> icn1(한국 IP) 프록시**로 해외 IP 차단을 우회하는 방식이 검증·가동됨. 사장님 PC·새 클라우드
> 계정 불필요. 상세는 아래 **13절**. 본 문서의 1~12절(PC 러너 설계)은 검토 이력으로 보존.

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

### 4.3 Vercel 서버리스 headless 검증 (2026-05-29, probe 6차)

사장님 목표 "손 안 대기"의 최선책으로 Vercel(icn1, 이미 결제 중) 안 headless 를 6차 probe 로 실증:
- ✅ **chromium launch OK** (`@sparticuz/chromium` + `playwright-core`, publisher.ts 패턴 재사용).
- ✅ **icn1 한국 IP 가 gov 사이트(노원) 안 막힘** — 목록 렌더 + 상세 링크 추출 성공. (IP 문제 해결 실증)
- ✅ **본문 JS 렌더됨** — 상세 페이지 한글 ~1,700자 존재.
- ❌ **본문 추출 불안정**: @sparticuz **headless-shell 이 풀 chromium 과 DOM 을 다르게 렌더**.
  노원 본문이 class 없는 `<td>` + `<p class="0">` 조각으로 흩어지고, class 있는 큰 요소는
  전부 메뉴(lnb/container). 로컬(풀 chromium)에서 잡히던 selector 가 Vercel headless-shell 에선
  matched:[]. **per-site selector 를 Vercel DOM 으로 직접 디버그해야 하는데 로컬과 DOM 이 달라
  deploy-probe 루프로만 가능 = 느리고 불안정.**
- ⚠️ networkidle + 반복 호출 시 `ERR_INSUFFICIENT_RESOURCES`(메모리). 순차 + 메모리 상향 필요.

**최종 판정 (8차 probe, 2026-05-29)**: Vercel headless **사용 불가**. `p[class="0"]` 로 본문 구조는
정확히 잡았으나 **글자가 전부 mojibake**(EUC-KR/PUA 를 headless-shell 이 잘못 디코딩 → lone
low-surrogate). 메뉴는 정상, 본문만 깨짐. 풀 chromium(로컬)은 동일 페이지를 클린 한글로 디코딩.
→ **풀 chromium 한국 클라우드 VM 만이 깨끗한 본문 제공.** (이하 원래 판정 유지)
**판정**: Vercel headless 는 IP·렌더는 되나 **본문 추출 신뢰성이 낮다**(headless-shell DOM 불일치).
→ **풀 chromium(한국 클라우드 VM)** 이면 로컬 디버깅 DOM 과 동일해 per-site selector 가 그대로
통한다(신뢰성 ↑). 단 사장님 계정/셋업 필요. 손 안 대기 vs 신뢰성 트레이드오프.

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

## 13. icn1 프록시 우회 — 검증·가동 완료 (2026-05-29)

사장님 "한국정부가 막은거 뚫는방법찾아봐" 요청에 따라, PC 상주 대신 **무료 GitHub Actions
(풀 chromium) + Vercel icn1(한국 IP) 프록시**로 해외 IP 차단을 우회. 검증·가동 완료.

### 아키텍처
```
[GitHub Actions ubuntu, 미국 IP] node runner.mjs (KEEPIOO_USE_PROXY=1)
  → makeScraper: chromium 렌더, page.route 로 .kr 요청 가로챔
      → POST https://www.keepioo.com/api/internal/icn1-fetch  (X-API-Key 인증)
[Vercel icn1, 한국 IP] icn1-fetch: 정부 도메인 allowlist 검증 → fetch(한국 IP)
      → 응답 바이트 그대로 base64 반환 (인코딩 보존)
  ← chromium 이 EUC-KR 정상 디코딩 → 본문 추출 → import-press-batch POST
```

### 핵심 구성
- `app/api/internal/icn1-fetch/route.ts` — icn1 리전 프록시. gov allowlist + X-API-Key(=IMPORT_PRESS_API_KEY)
  + base64 바이트 보존. `vercel.json` 에 `regions:["icn1"]` 핀.
- `playwright/lib/_factory.mjs` — `KEEPIOO_USE_PROXY` 시 page.route 우회(이미지·CSS·폰트·미디어 abort,
  domcontentloaded, 타임아웃 상향). 미설정 시 기존 직접 경로 그대로(회귀 0).
- `playwright/runner.mjs` — `KEEPIOO_RUNNER_CITIES` 로 검증 도시만 점진 활성화.
- `.github/workflows/local-press-proxy.yml` — KST 10/22, KEEPIOO_USE_PROXY=1, RUNNER_CITIES=nowon.

### 검증 결과
- **노원 본문 1,873자 / 깨진 글자 0** (해외 IP, GitHub Actions). Vercel headless-shell 의 mojibake 와
  대조 — 풀 chromium 은 EUC-KR 클린 디코딩.
- 프로덕션 러너 1회 dispatch: fetched 10 / inserted 0 / skipped 10(dedupe 정상).
  DB 의 노원 10건 본문 1,377~2,062자, breadcrumb 잡음 없이 제목+본문, **분류까지 완료**.
- 즉 우회 → 수집 → 저장 → 분류 전체 파이프라인 프로덕션 정상 작동.

### 다음 도시 확장 절차
도시 추가 시: ① 프록시 allowlist(`icn1-fetch` ALLOWED_SUFFIX/EXACT)에 도메인 추가 →
② 해당 도시 detail DOM 에서 본문 컨테이너 selector 검증(factory BODY_SELECTORS 매칭 확인) →
③ `cities.mjs`/`runner.mjs` 등록 + 정적 `_registry.ts` 제거(dual-path 방지) →
④ `local-press-proxy.yml` 의 `KEEPIOO_RUNNER_CITIES` 에 key 추가.

### 비용·운영
- 비용 0 (GitHub Actions 무료 + 이미 결제 중인 Vercel Pro). 사장님 PC·신규 클라우드 계정 불필요.
- PC 러너(1~12절)의 idle 리스크 제거. 단 GitHub Actions 무료 한도(공개 repo 무제한)·Vercel
  함수 실행시간(maxDuration 60s/요청) 내에서 동작.
