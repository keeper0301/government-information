# 사장님 보안 회전 가이드 (2026-05-18)

> **작성일**: 2026-05-18
> **대상**: 사장님 직접 액션 (외부 콘솔)
> **예상 소요**: 5~10분
> **우선순위**: 높음 — 비밀번호 26 도메인 재사용 + API 키 채팅 평문 노출

## 회전 대상 2건

| # | 자산 | 사고 | 우선순위 |
|---|---|---|---|
| 1 | **`cgc0301!`** (Render saved password) | Chrome paste hijack 으로 채팅·screenshot 노출. 사장님 26 도메인 재사용 중 | **최고** |
| 2 | **`RENDER_API_KEY`** (rnd_f4rqL6...) | 5/18 채팅 평문 입력 — `feedback_secret_in_chat` 룰 위반 | 높음 |

---

## 1. `cgc0301!` 회전 (5분)

### 1-1. 새 비밀번호 생성 원칙
- 16자 이상
- 도메인별 다르게 (재사용 금지)
- 패스워드 매니저 (1Password / Bitwarden / Chrome 내장) 자동 생성·저장 권장

### 1-2. 우선순위 6 도메인 (영향도 ↓ 순)

| 순서 | 도메인 | 영향 | 변경 위치 |
|---|---|---|---|
| 1 | https://dashboard.render.com | Render keepio-agent 서비스 + 25 env 노출 | Account → Settings → Change Password |
| 2 | https://supabase.com/dashboard | Supabase DB·Auth 전체 권한 | Account → Settings → Password |
| 3 | https://vercel.com/account | keepioo-prod 배포·env 전체 권한 | Account → Settings → Security |
| 4 | https://aistudio.google.com | Gemini ₩100K cap 변경 권한 | Google Account password (전체 영향) |
| 5 | https://accounts.google.com | keeper0301@gmail.com 전체 권한 (AdSense·Search Console·Drive) | Google Account → Security → Password |
| 6 | (선택) GitHub, Solapi, 토스, Anthropic, OpenAI 등 사장님 사용 26 도메인 | 각각 영향 | 각 사이트 Account Settings |

### 1-3. 사후 조치
- Google Password Checkup (https://passwords.google.com/checkup) 실행 → 재사용·유출 비밀번호 자동 감지
- Chrome saved password 에서 옛 `cgc0301!` 제거 (메모리 [chrome-paste-hijack-2026-05-18] 사고 재발 방지)

---

## 2. `RENDER_API_KEY` 회전 (3분)

### 2-1. 옛 키 revoke
1. https://dashboard.render.com/u/settings/api-keys 접속
2. **`rnd_f4rqL6EBmAENLGNxssOWwBACtIjH`** 행 찾기
3. **"Delete"** 클릭 → 확인

### 2-2. 새 키 발급
1. 같은 페이지에서 **"Create API Key"** 클릭
2. Name: `keepio-agent-2026-05-18` (날짜 명시로 회전 추적)
3. **새 키 (rnd_xxx...)** 표시되면 **즉시 복사**
4. 사장님 1Password / Bitwarden 등 패스워드 매니저에 저장 (채팅 평문 입력 금지)

### 2-3. 사용처 갱신 (있다면)
- `.env.local` 에 등록된 옛 키 → 새 키로 교체
- 클로드에게 "RENDER_API_KEY 회전 완료" 만 알려주면 클로드는 새 키 직접 입력 받지 않음
- 클로드가 Render API 호출 필요 시 `.env.local` 의 새 키 자동 사용

---

## 3. 검증 (회전 후 3분)

### 3-1. Render API 정상 호출
```powershell
# .env.local 의 새 RENDER_API_KEY 확인 후
$env:RENDER_API_KEY = (Get-Content .env.local | Select-String "RENDER_API_KEY=").Line.Split("=")[1]
curl -H "Authorization: Bearer $env:RENDER_API_KEY" https://api.render.com/v1/services
```
결과: `keepio-agent` 서비스 정보 포함 JSON 반환 시 정상

### 3-2. Render 로그인 정상
- https://dashboard.render.com 새 비밀번호로 로그인 확인
- keepio-agent 서비스 (srv-d84vlgek1jcs73andjbg) 정상 노출

### 3-3. Supabase / Vercel / Google 로그인 정상
- 각 콘솔에 새 비밀번호로 1회씩 로그인 확인

---

## 4. 메모리 갱신 (사장님 회전 완료 후)

다음 세션에서 사장님이 "회전 완료" 알려주시면 클로드가:
- 메모리 [feedback_secret_in_chat] 에 "5/18 RENDER_API_KEY 회전 완료" 기록
- 메모리 [feedback_chrome_paste_hijack_2026_05_18] 에 "cgc0301! 회전 완료, 26 도메인 별도 비밀번호 전환" 기록
- 메모리 [project_codex_autonomous_phase6_w0_2026_05_18] 의 "사장님 보안 회전 권고" 섹션 → "완료" 로 갱신

---

## 5. 자주 묻는 질문

**Q1. Chrome 저장된 비밀번호도 다 바꿔야 하나요?**
A. 6 우선순위 도메인부터. 나머지는 Google Password Checkup 의 권고에 따라 점진적으로.

**Q2. RENDER_API_KEY 회전하면 keepio-agent 서비스 멈추나요?**
A. 안 멈춤. API 키는 클로드/사장님이 Render dashboard 외부에서 API 호출할 때만 사용. 서비스 자체는 영향 0.

**Q3. 비밀번호 매니저 어떤 거 추천?**
A. Chrome 내장 (Google Password Manager) 가 가장 단순. 26 도메인 동기화 자동. 별도 설치 0.

---

## 6. 참조

- 메모리: [[feedback_chrome_paste_hijack_2026_05_18]] — Chrome paste hijack 사고
- 메모리: [[feedback_secret_in_chat]] — 채팅 평문 입력 금지 룰
- 메모리: [[project_codex_autonomous_phase6_w0_2026_05_18]] — 사장님 보안 회전 권고 (Render·RENDER_API_KEY)
