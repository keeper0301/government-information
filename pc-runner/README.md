# keepioo PC runner

ASN 차단·SPA site (광산구·제주·평택) 의 한국 IP fetch 우회. 서울·부산·강원 은 5/26 일반 cron 으로 회생됨.

## 작동 흐름

```
사장님 PC (한국 IP)
  ↓
1. list URL fetch (한국 정부 site 정상 응답)
2. POST keepioo.com /api/admin/local-press/upload — list_html
3. server: parseListItems → sourceUrls 반환
4. PC: 각 sourceUrl fetch
5. POST keepioo.com — list_html + detail_htmls map
6. server: insert news_posts (NOT NULL 가드 + audit)
```

## 설치 (자동)

```powershell
cd C:\Users\cgc09\projects\government-information\pc-runner
.\setup-desktop.ps1
```

## 사장님 직접 작업 (2분)

### 1. PC_RUNNER_SECRET 발급
강한 일회성 비밀번호 (32자+).

### 2. Vercel env 등록
- Vercel dashboard → keepioo project → Settings → Environment Variables
- Name: `PC_RUNNER_SECRET`
- Value: 위 secret
- Environments: Production · Preview · Development 모두 체크
- Save

### 3. PC `.env` 입력
`C:\Users\cgc09\keepioo-pc-runner\.env` 열기:
```
PC_RUNNER_SECRET=<2번 동일 값>
```

### 4. dry-run
```powershell
cd C:\Users\cgc09\keepioo-pc-runner
node local-press-runner.mjs
```

기대 출력:
```
[round 1] list_html upload + server parse
  busan: list 111469 bytes ✅
  gwangsan: list 140647 bytes ✅
  ...
[round 2] insert 결과:
  부산광역시: fetched 10 / inserted N / skipped M / errors 0
  ...
```

### 5. Task Scheduler 매일 KST 09:30

작업 스케줄러 → 작업 만들기:
- 이름: keepioo-pc-runner
- 트리거: 매일 09:30
- 동작: `node.exe C:\Users\cgc09\keepioo-pc-runner\local-press-runner.mjs`
- 사용자: 본인 (BATCH 권한)

## 처리 site (2026-06-02 update — 5 site)

| city_key | site | 왜 PC runner 가 필요한가 |
|----------|------|------|
| **namdong** | namdong.go.kr | **prod(Vercel) 403 IP 차단** (donggu·ongjin 은 정상). 6/2 cron 로그 확인. 신규 |
| jeju | jeju.go.kr/news/bodo/list.htm | prod 간헐 fetch failed (데이터센터 IP) |
| pyeongtaek | pyeongtaek.go.kr | SPA + token CSRF — list parse 0 가능 |
| busan | busan.go.kr/nbtnewsBU | 정적 PDF 전문 추출로 회생(보조 — PC runner 도 가능) |
| gwangsan | gwangsan.go.kr | 정적 복구됨(보조) |

- **PC runner 가 진짜 필요한 핵심 3 site**: namdong(403)·jeju(간헐)·pyeongtaek(SPA).
  busan·gwangsan 은 일반 cron 으로도 수집되나 ASN 목록에 남겨 둠(이중 수집은 동일
  sourceCode 의 23505 dedupe 로 중복 없음).
- 이전 회생: seoul(RSS endpoint)·gangwon(hwp5 첨부 전문)·busan(PDF 전문) 은 일반 cron OK.

## 트러블슈팅

### `PC_RUNNER_SECRET 환경변수 미설정`
`.env` 파일 PC_RUNNER_SECRET 값 확인.

### `upload 401`
Vercel env 의 PC_RUNNER_SECRET 와 PC `.env` 동일 값인지 확인.

### round1 results 의 items 0
SPA site — server parseListItems 가 0 반환. Playwright fallback (다음 commit).

## 자가 감지 (2026-05-26)

PC runner 가동 상태는 [/admin/autonomous](https://www.keepioo.com/admin/autonomous) 의 LocalPressCard 에서 자가 인식.

| 상태 | 시각 |
|---|---|
| 24h 안 가동 | 보라 `🖥️ PC runner 마지막 가동 · N분 전` |
| 48h+ stale | amber `⚠️ 48h+ stale` (PC 종료 / 인터넷 끊김 의심) |
| 7d+ stale | red `🚨 7일+ 미가동, PC OFF 가능성` |
| 가동 0회 | slate `아직 가동 0회 · 설치 가이드` |

7일 가동 0건 시 PendingExternalActionsCard 의 "PC runner 본체 가동" 외부 액션 으로 자동 추가.
