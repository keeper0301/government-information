# Naver Auto Draft Helper

운영 중인 사이트의 RSS 글감이나 현재 페이지 내용을 가져와 네이버 블로그용 제목/본문 초안으로 재구성하고, 네이버 블로그 글쓰기 화면에 채워 넣는 Chrome 확장프로그램 MVP입니다.

## 현재 구현된 기능

구현 현황 전체 표는 `docs/FEATURE_STATUS.md`에서 확인할 수 있고, 릴리즈 검증에는 `python3 scripts/verify_feature_coverage.py`가 포함됩니다.

- RSS/Atom 글감 수집
- 현재 활성 페이지 기반 글감 가져오기
- 네이버 블로그용 제목 재구성
- 네이버 블로그용 본문 재구성
- 키워드 유형 선택
  - 일반 블로그
  - 숏텐츠 키워드
  - 인플루언서 키워드
  - 쇼핑커넥트 분석
- 이미지 소스 선택
  - 이미지 없음
  - 네이버 이미지 검색
  - 제미나이 나노바나나
  - 젠스파크
  - 챗지피티 이미지
- 이미지 검색어/생성 프롬프트 생성
- 초안 클립보드 복사
- 네이버 블로그 글쓰기 화면 열기
- 네이버 글쓰기 화면에 제목/본문 채우기
- 네이버 에디터 진단 결과 클립보드 복사
- 임시저장 버튼 탐지

## 안전선

이 MVP는 자동 발행을 하지 않습니다.

- 발행 버튼 클릭 없음
- 외부 AI API 자동 호출 없음
- 네이버 이미지 자동 다운로드 없음
- 네이버 임시저장 버튼 자동 클릭 없음
- RSS fetch는 http/https URL만 허용
- RSS 응답은 10초 타임아웃과 2MB 크기 제한 적용

현재는 제목/본문을 채우고, 임시저장 버튼이 있는지만 알려줍니다. 실제 저장 클릭은 사용자가 직접 합니다.

## 설치 방법

1. Chrome에서 `chrome://extensions` 열기
2. 오른쪽 위 `개발자 모드` 켜기
3. `압축해제된 확장 프로그램을 로드` 클릭
4. 이 폴더 선택

```text
/home/user/.hermes/workspace/naver-auto-draft-extension
```

## 사용 방법

### RSS 글감 사용

1. 확장프로그램 아이콘 클릭
2. RSS 주소 입력
3. `RSS 가져오기` 클릭
4. 목록에서 글감 선택
5. 키워드 유형/톤 선택
6. `네이버 블로그용 재구성` 클릭
7. `네이버 글쓰기 열기` 클릭
8. 네이버 로그인/글쓰기 화면 준비
9. 확장프로그램에서 `네이버 임시저장 채우기` 클릭
10. 네이버 에디터에서 내용 확인 후 직접 임시저장

입력이 실패하면 네이버 글쓰기 화면에서 `에디터 진단`을 누르세요. 진단 JSON이 클립보드에 복사되며, 그 결과로 selector를 보강할 수 있습니다.

SmartEditor가 확장 내부 JS 입력을 받아들이지 않는 경우에는 Windows 전용 네이티브 붙여넣기 helper를 사용할 수 있습니다. 이 helper는 UTF-8 파일의 제목/본문을 `.NET UnicodeText` 클립보드에 올린 뒤 실제 `Ctrl+V`를 보내므로, 실제 검증에서 한글 깨짐 없이 입력되는 것을 확인했습니다. 최신 helper는 네이버의 “작성 중인 글이 있습니다” 복원 팝업을 감지해 기본적으로 `확인`을 누른 뒤 제목/본문을 교체하고, 붙여넣기 후 `verification.titleHit` / `verification.bodyHit`로 실제 SmartEditor 텍스트 감지 결과를 출력합니다. 자세한 절차는 `docs/NATIVE_PASTE_FALLBACK.md`와 `docs/WINDOWS_TESTING.md`를 확인하세요.

Windows popup의 RSS 수집/초안 생성은 `scripts/ui_popup_rss_force_navigate.ps1`로 smoke test할 수 있습니다. 이 스크립트는 `chrome-extension://.../popup.html`을 클립보드+`Ctrl+V`로 열어 `SendKeys` 특수문자 깨짐을 피하고, `rssUrl`/`loadRss`/`generateDraft` 컨트롤을 실제 UIAutomation으로 검증합니다.

### 현재 페이지 글감 사용

1. 글감으로 쓸 페이지를 열기
2. 확장프로그램 아이콘 클릭
3. `현재 페이지 글감 가져오기` 클릭
4. 초안 생성 후 네이버 글쓰기 화면에 채우기

## 릴리즈/자동 업데이트 준비

개발용 압축해제 설치는 Chrome 정책상 자동 업데이트가 되지 않습니다. 자동 업데이트를 하려면 Chrome Web Store 배포 또는 self-hosted CRX 배포가 필요합니다.

현재 확장에는 설치본 업데이트 확인 기능이 포함되어 있습니다.

- service worker가 6시간마다 `chrome.runtime.requestUpdateCheck()` 실행
- alarm 등록 실패는 `alarm_status`에 기록하고 service worker unhandled rejection을 막음
- 발행 alarm 결과는 `last_publish_alarm`에 저장해 마지막 시도/성공/중단 사유 확인 가능
- popup의 `🔄 업데이트 확인` 버튼으로 수동 확인
- 결과는 `chrome.storage.local.update_status`에 저장
- self-hosted CRX 릴리즈는 `build_self_hosted_release.py`가 릴리즈용 manifest에 `update_url`을 주입

릴리즈 산출물 생성:

```bash
python3 scripts/build_release.py
```

생성물:

- `dist/naver-auto-draft-extension-v<version>.zip`
- `dist/naver-auto-draft-extension-latest.zip`
- `dist/updates.xml`
- `dist/VERSION.json`

자세한 절차는 `docs/AUTO_UPDATE.md`를 확인하세요.

## 다음 단계 추천

### 1단계: 품질 개선

- 네이버 블로그 제목 패턴 20개 템플릿 추가
- 본문 구조를 정보형/후기형/비교형/전환형으로 분리
- 금칙어/과장 표현 줄이기
- 원문 출처 표기 방식 옵션화

### 2단계: 이미지 흐름 강화

- 네이버 이미지 검색 URL 자동 열기
- 이미지 생성 서비스별 프롬프트 템플릿 분리
- 썸네일용/본문 삽입용 프롬프트 분리
- 이미지 없음 선택 시 본문형 글로 자연스럽게 보완

### 3단계: 네이버 에디터 안정화

- 네이버 스마트에디터 DOM 변경 대응
- iframe 내부 에디터 탐색 강화
- 확장 JS 입력이 실패할 때 Windows 네이티브 붙여넣기 fallback 사용
- 임시저장 버튼 자동 클릭은 별도 승인 후 옵션으로만 추가
- 저장 성공 토스트 감지

### 4단계: AI 연동

현재 MVP는 브라우저 안에서 템플릿 기반으로 재구성합니다. 실제 AI 품질을 넣으려면 아래 중 하나가 필요합니다.

- Gemini API 키 입력 옵션
- OpenAI API 키 입력 옵션
- 사용자가 ChatGPT/Gemini 웹에 붙여넣을 프롬프트 자동 생성
- 서버 없이 로컬에서만 동작하는 프롬프트 복사 방식

## 파일 구조

```text
naver-auto-draft-extension/
├── manifest.json
├── background.js
├── popup.html
├── popup.css
├── popup.js
├── content/
│   └── naverEditor.js
└── README.md
```

## 주의

네이버 블로그 에디터는 DOM 구조가 자주 바뀔 수 있습니다. 제목/본문 채우기가 실패하면 `content/naverEditor.js`의 selector를 현재 에디터 구조에 맞게 보강해야 합니다.
