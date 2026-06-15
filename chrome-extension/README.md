# Keepioo Naver Publisher — Chrome Extension

24시간 가동 본체 PC 의 평소 Chrome 에 설치하는 자동 발행 Extension (Manifest V3).
playwright RPA 대체 — cookies 만료 문제 영구 해결 + naver 정지 위험 ↓.

## 빠른 설치 (본체 PC, 권장) — 단계별 체크리스트

### 사전 준비 (본체 PC 에 한 번만)

- [ ] Chrome 설치 (https://www.google.com/chrome)
- [ ] git 설치 (https://git-scm.com — 설치 시 기본 옵션 OK)
- [ ] Chrome 에서 naver.com 로그인 상태 유지 (Extension 이 이 cookies 재사용)
- [ ] Vercel 콘솔 keepioo 프로젝트에 접근 권한 (브라우저에서 vercel.com 로그인된 상태)

### 1 단계 — PowerShell 한 줄 실행

본체 PC 에서 **PowerShell** 검색해서 열고, 아래 한 줄을 그대로 붙여넣고 Enter:

```powershell
iwr https://raw.githubusercontent.com/keeper0301/government-information/master/chrome-extension/setup-desktop.ps1 -UseBasicParsing -OutFile $env:TEMP\keepioo-setup.ps1; & $env:TEMP\keepioo-setup.ps1
```

스크립트가 자동으로 처리하는 6 단계:
1. github repo clone (또는 pull) → `%USERPROFILE%\keepioo\government-information\`
2. NAVER_EXTENSION_SECRET 32 바이트 신규 생성
3. `chrome-extension\local-secret.txt` 작성 (popup.js 가 자동 로드, gitignored)
4. Chrome 으로 Vercel env 페이지 열기 + SECRET 을 클립보드 복사
5. 빈 commit push 로 Vercel 재배포 trigger
6. `chrome://extensions/` 열기 + 폴더 경로 클립보드 복사

스크립트가 진행 중 **두 번** 멈추고 Enter 대기:
- **첫 번째 대기**: Vercel env 페이지에서 사장님이 직접 NAVER_EXTENSION_SECRET 갱신·Save → Enter
- (재배포 자동) → 두 번째 대기 없음

### 2 단계 — 사장님 manual (3회 클릭만)

**a) Vercel UI** (스크립트가 열어준 탭):
- [ ] `NAVER_EXTENSION_SECRET` 항목 옆 ⋮ → **Edit**
- [ ] Value 입력란에 **Ctrl+V** (클립보드에 SECRET 이미 복사됨)
- [ ] **Sensitive** 체크 **ON** (보안 권장)
- [ ] **Save** 클릭
- [ ] PowerShell 으로 돌아가 **Enter** (스크립트가 재배포 trigger)

**b) chrome://extensions/** (스크립트가 열어준 탭):
- [ ] 우상단 **개발자 모드** 토글 **ON**
- [ ] 좌상단 **압축해제된 확장 프로그램 로드** 클릭
- [ ] 파일 다이얼로그에서 **Ctrl+L** → **Ctrl+V** (클립보드의 폴더 경로) → **Enter**
- [ ] Extension 카드가 나타나면 우상단 🧩 퍼즐 아이콘 → "Keepioo Naver Publisher" 옆 📌 클릭 (핀 고정)

**c) Extension popup** (핀 고정한 아이콘 클릭):
- [ ] popup 열림 → 상단 status 박스에 `✅ local-secret.txt 자동 로드됨` 표시 확인
- [ ] **🧪 Dry-run (실 발행 X)** 클릭 → 약 60초 대기
- [ ] 결과 박스에 `✅ dry-run OK` + debug JSON 표시되면 **셋업 성공**

### 3 단계 — 검증

- [ ] 사이트 어드민 (https://www.keepioo.com/admin/autonomous) 접속
- [ ] Phase 5 카드 의 "24h naver 블로그" metric 확인 (다음 cron fire 후 1+ 표시)
- [ ] 가동 schedule: KST 09:30 / 12:30 / 15:30 / 18:30 / 21:30 (Chrome 가동 중일 때만)

## 수동 설치 (다른 PC 또는 setup-desktop.ps1 실패 시)

1. repo clone: `git clone https://github.com/keeper0301/government-information.git`
2. `chrome://extensions/` → 우상단 **"개발자 모드"** ON → 좌상단 **"압축해제된 확장 프로그램 로드"** → `chrome-extension\` 폴더 선택
3. Extension popup 핀 고정 → 클릭 → `KEEPIOO_SECRET` 입력란에 Vercel 의 `NAVER_EXTENSION_SECRET` 값 입력 → 저장
4. **🧪 Dry-run** 클릭 → 결과 확인 (네이버 블로그에 실 발행 X)
5. 정상 작동 확인 후 가동 시작

## 자동 발행 방식 선택 근거

- 네이버 블로그 글쓰기 공식 API는 종료되어 서버에서 REST API로 안전하게 직접 발행하는 방식은 사용할 수 없습니다.
- 그래서 keepioo는 **사용자 본체 PC의 로그인된 Chrome + Manifest V3 Extension** 방식으로 발행합니다.
- 장점: 네이버 로그인 cookies를 사용자의 정상 Chrome 세션에서 재사용하므로 headless/서버 IP 자동화보다 캡차·기기 인증·계정 정지 위험을 낮춥니다.
- 안전선: 신규 7일 3건/일, 이후 7건/일 cap과 KST 09~22 시간대를 지킵니다.

## 자동 발행 schedule

매일 KST 5회 fire (사장님 Chrome 가동 중일 때만):
- 09:30 / 12:30 / 15:30 / 18:30 / 21:30

각 fire 시 invisible tab 에서:
1. keepioo 큐 조회 — 다음 발행 글 최대 3건을 순차 처리
2. SE3 글쓰기 페이지 자동 입력 (제목·본문·이미지)
3. 발행 click
4. tab close (사장님 작업 방해 X)
5. keepioo audit 보고 + 텔레그램 알림

popup 에서 **🚀 큐 자동 발행 (일 cap까지)** 를 누르면 같은 로직으로 당일 cap까지 수동 catch-up 할 수 있습니다.

## 일 cap (정지 예방)

- 신규 7일: 3건/일
- 그 이후: 7건/일
- 시간대: KST 09:00~22:00 만

## 사고 시 (트러블슈팅)

popup → 🧪 Dry-run 으로 진단. 실패 메시지가 status 박스에 자세히 표시.

| 증상 | 원인 / 해결 |
|---|---|
| `cookies 만료 — naver 로그인 redirect` | Chrome 에서 naver.com 다시 로그인. cookies 갱신 후 dry-run 재시도. |
| `dry-run fail: 본문 paste 실패 의심 (length<200)` | SE3 의 paste 핸들러 변경 가능성. content.js `pasteHtml` 3중 fallback 확인. |
| `KEEPIOO_SECRET 미설정` | popup 의 secret 입력란에 Vercel `NAVER_EXTENSION_SECRET` 값 다시 저장. |
| `/next 401` | Vercel env 의 `NAVER_EXTENSION_SECRET` 와 popup 의 KEEPIOO_SECRET 가 불일치. Vercel env 갱신 시 popup 재저장 깜빡 빈번 — popup 다시 열어 같은 값으로 저장. |
| `/next 500 NAVER_EXTENSION_SECRET not configured` | Vercel env 누락. Production + Preview 양쪽 등록 필요. |
| `status: outside_hours` | KST 09 ~ 22 외 시간 — 정상 skip. force 검증은 dry-run 으로만 가능. |
| `status: daily_cap_reached` | 신규 7일 3건/일, 이후 7건/일 도달. 정상. |
| 알람 fire 인데 글 안 올라옴 | Chrome 종료된 상태. service worker 가 idle 후 unload 됐을 수 있음. popup 1회 열어 재활성화. |
| content.js inject 실패 (executeScript) | manifest host_permissions 권한 거부됐을 가능성. chrome://extensions/ → 본 확장 → "사이트 권한" 재확인. |
| alarms 발화 안 됨 의심 | chrome://extensions/ → 본 확장 → "서비스 워커" 옆 "검사" 클릭 → DevTools console 에서 `chrome.alarms.getAll(console.log)` 입력 → 5개 alarm (`naver-0930` ~ `naver-2130`) 등록 + 다음 fire 시점 확인. |
| 코드 수정했는데 반영 안 됨 | `chrome://extensions/` → 본 확장 카드의 🔄 새로고침 버튼 (재로드) 클릭. service worker 재시작 필요. |

## Chrome 종료 시 동작

- service worker 는 알람 fire 시점에 깨어남 → Chrome 자체가 종료되면 알람 발화 안 됨.
- 사장님 PC 가 꺼져 있어도 동일.
- 해결: Chrome 을 켜둔 채 PC 사용. Chrome 백그라운드 모드 (`chrome://settings/system` → "Google Chrome 을(를) 닫은 후에도 백그라운드 앱 계속 실행" ON) 권장.

## Vercel 환경변수 등록 필요

- `NAVER_EXTENSION_SECRET` (production + preview) — Extension popup 의 KEEPIOO_SECRET 와 동일 값
  - 32자+ 랜덤 권장: `openssl rand -hex 32` 또는 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`

## 이전 playwright RPA 정리 (2026-05-13 전환)

Chrome Extension 가동 검증 (dry-run + 실 발행 1회) 후 다음 정리 권장:

1. **Task Scheduler 5 task 일괄 제거**
   ```powershell
   .\scripts\setup-naver-task-scheduler.ps1 -Remove
   ```
2. **chromium profile 폴더 삭제** (cookies 만료 후 가치 없음)
   ```powershell
   # 반드시 절대경로로 실행 — 다른 cwd 에서 상대경로 쓰면 의도 외 폴더 삭제 위험
   Remove-Item -Recurse -Force "C:\Users\cgc09\projects\government-information\naver-chromium-profile"
   ```
3. **deprecated 로컬 스크립트 (gitignored)**
   - `scripts/naver-publish-runner.mjs`
   - `scripts/setup-naver-task-scheduler.ps1`
   - `scripts/naver-chrome-setup.mjs`
   - 파일 헤더에 DEPRECATED 명시 — 신규 실행 금지.
   - 보존·삭제 선택 자유 (사장님 PC 만 존재, git 추적 X).

## 파일 구조

```
chrome-extension/
├── manifest.json       (Manifest V3 권한)
├── background.js       (service worker, chrome.alarms 5회)
├── content.js          (SE3 자동화 — runner.mjs flow 재사용)
├── popup.html + .js    (manual trigger + secret 저장)
├── icons/              (16/48/128 placeholder PNG)
└── README.md           (이 파일)
```
