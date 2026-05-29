# 네이버 클라우드 VM에 Playwright 러너 올리기 (사장님 가이드)

JS로 본문을 그리는 시·군청 보도자료는 한국 IP의 브라우저로만 수집됩니다. Vercel(서버리스)은
완전한 브라우저를 못 돌리고, GitHub Actions는 미국 IP라 차단됩니다. 그래서 **한국 클라우드의
작은 서버(VM)에서 브라우저(Playwright)를 24시간 돌립니다.** 한 번 세팅하면 사장님 손이 안 갑니다.

## 사장님이 하는 것 (1회, 약 20~30분)

### 1단계 — 네이버 클라우드 가입 + 결제수단 등록
- https://www.ncloud.com 가입 → 마이페이지에서 결제수단(카드) 등록
- **Micro 서버는 결제수단 등록일부터 1년간 무료**입니다. (1년 후 반납 안 하면 소액 과금)

### 2단계 — Micro 서버 생성 (Ubuntu)
- 콘솔 → Server → 서버 생성
- 서버 타입: **Micro** (국내 전용, 무료)
- OS: **Ubuntu** (최신 LTS)
- 인증키(authentication key) 새로 생성 → **.pem 키 파일 다운로드·보관** (서버 접속에 필요)

### 3단계 — 서버 접속 준비 (포트 포워딩)
- Micro 서버는 공인 IP가 없어 **포트 포워딩**으로 SSH 접속합니다.
- 콘솔 → Server → 포트 포워딩 설정 → 외부 포트(예 1022) → 서버 22번 연결
- 접속 비밀번호 확인: 콘솔에서 .pem 키로 관리자 비밀번호 확인

> 이 단계가 어려우면, 제가 화면 보면서 같이 진행해 드릴 수 있습니다(원하시면 말씀만).

### 4단계 — IMPORT_PRESS_API_KEY 값 확인
- Vercel → government-information 프로젝트 → Settings → Environment Variables
- `IMPORT_PRESS_API_KEY` 값 복사 (러너가 keepioo로 데이터 보낼 때 인증에 씀)

### 5단계 — 서버에서 셋업 한 줄 실행
서버에 SSH로 접속한 뒤(포트 포워딩 IP·포트 + .pem 키 + 관리자 비번), 아래 한 줄을 붙여넣고
`<KEY>` 자리에 4단계의 값을 넣어 실행:

```bash
curl -fsSL https://raw.githubusercontent.com/keeper0301/government-information/master/playwright/setup-vm.sh | bash -s -- <KEY>
```

자동으로 Node·브라우저 설치 + 6시간마다 수집 cron 등록까지 끝납니다.

## 끝나면
- **자동 수집**: 매일 KST 10/16/22/4시 (사장님 손 안 감)
- **확인**: keepioo 어드민의 수집 현황, 또는 서버의 `~/keepioo-runner/playwright/runner.log`
- 코드가 업데이트되면 서버에서 `cd ~/keepioo-runner && git pull` 한 번이면 반영

## 현재 가동 대상
- ✅ 노원구 (검증 완료 — 풀 브라우저로 본문 1,600자+ 추출)
- ⏳ 나머지 JS 렌더 시·군(부산북구·기장·광주남구·동래·김포·창원·성남·안산·천안 등)은
  사이트별 selector를 제가 로컬(풀 브라우저=VM과 동일)에서 맞춰 `playwright/lib/cities.mjs`에
  추가합니다. 추가될 때마다 서버는 `git pull`로 받아 자동 가동.

## 비용
- Micro 서버: **1년 무료**, 이후 월 소액. 공인 IP는 안 쓰므로(러너는 바깥으로 보내기만 함) 무료 유지.
