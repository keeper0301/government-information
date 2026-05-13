# Keepioo Naver Publisher — Chrome Extension

사장님 평소 Chrome 에 설치하는 자동 발행 Extension (Manifest V3).
playwright RPA 대체 — cookies 만료 문제 영구 해결 + naver 정지 위험 ↓.

## 설치 (1회만)

1. Chrome 주소창에 `chrome://extensions/` 입력
2. 우상단 **"개발자 모드"** 토글 켜기
3. 좌상단 **"압축해제된 확장 프로그램 로드"** 클릭
4. `C:\Users\cgc09\projects\government-information\chrome-extension\` 폴더 선택
5. 권한 승인 (cookies / tabs / alarms 등) — naver 자동 발행에 필요

## 초기 설정 (1회)

1. Chrome 우상단 Extension 아이콘 (퍼즐 모양) → "Keepioo Naver Publisher" 핀 고정
2. 아이콘 클릭 → popup 열림
3. **KEEPIOO_SECRET** 입력란에 사장님께 받은 Vercel 의 `NAVER_EXTENSION_SECRET` 값 입력 → **저장**
4. **🧪 Dry-run** 클릭 → 결과 확인 (네이버 블로그에 실 발행 X)
5. 정상 작동 확인 후 자동 발행 활성화 — Chrome 만 켜져 있으면 됨

## 자동 발행 schedule

매일 KST 5회 fire (사장님 Chrome 가동 중일 때만):
- 09:30 / 12:30 / 15:30 / 18:30 / 21:30

각 fire 시 invisible tab 에서:
1. keepioo 큐 조회 — 다음 발행 글 1건
2. SE3 글쓰기 페이지 자동 입력 (제목·본문·이미지)
3. 발행 click
4. tab close (사장님 작업 방해 X)
5. keepioo audit 보고 + 텔레그램 알림

## 일 cap (정지 예방)

- 신규 7일: 3건/일
- 그 이후: 7건/일
- 시간대: KST 09:00~22:00 만

## 사고 시

popup → 🧪 Dry-run 으로 진단. 실패 메시지가 status 박스에 자세히 표시.

## Vercel 환경변수 등록 필요

- `NAVER_EXTENSION_SECRET` (production + preview) — Extension popup 의 KEEPIOO_SECRET 와 동일 값
  - 32자+ 랜덤 권장: `openssl rand -hex 32` 또는 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`

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
