# 소셜 로그인 설정 가이드

카카오·구글 로그인을 활성화하려면 **3곳**의 설정이 필요해요.
코드는 이미 작성되어 있고, 아래 외부 콘솔 설정만 하면 동작합니다.

**⏱ 소요 시간:** 약 25~30분
**💰 비용:** 전부 무료

---

## 🔑 사전 준비: Supabase 프로젝트 확인

먼저 Supabase 대시보드(https://supabase.com/dashboard)에 접속해서
이 프로젝트의 **Project URL**을 확인하세요.

- 왼쪽 메뉴 → **Project Settings** → **API** → **Project URL**
- 예: `https://abcdefghijk.supabase.co`

이 URL의 일부(`abcdefghijk`)를 "프로젝트 Ref"라고 부르고, 아래에서 필요합니다.

또한 **Redirect URL**도 복사해두세요:
- `https://<프로젝트ref>.supabase.co/auth/v1/callback`

예: `https://abcdefghijk.supabase.co/auth/v1/callback`

---

## 1️⃣ 구글 로그인 설정 (약 10분)

### 1-1. Google Cloud Console에서 OAuth 클라이언트 만들기

1. https://console.cloud.google.com 접속 → 구글 계정으로 로그인
2. 상단 프로젝트 선택 → **프로젝트 만들기** (없으면)
   - 프로젝트 이름: "정부정책알림" 같이 자유롭게
3. 좌측 메뉴 → **API 및 서비스** → **OAuth 동의 화면**
   - User Type: **외부(External)** 선택 → 만들기
   - 앱 이름: 서비스 이름 (예: 정부정책알림)
   - 사용자 지원 이메일: 본인 이메일
   - 개발자 연락처: 본인 이메일
   - 나머지는 기본값 → **저장 후 계속**
   - "범위" 단계: 그냥 계속 (기본값)
   - "테스트 사용자": 일단 건너뜀 (프로덕션 모드로 전환 후 필요없음)
4. 좌측 메뉴 → **API 및 서비스** → **사용자 인증 정보**
   - 상단 **+ 사용자 인증 정보 만들기** → **OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - 이름: 자유롭게 (예: "정부정책알림-웹")
   - **승인된 리디렉션 URI**에 추가:
     ```
     https://<프로젝트ref>.supabase.co/auth/v1/callback
     ```
     (위 사전 준비에서 복사한 주소)
   - **만들기** 클릭
5. 팝업에 **클라이언트 ID**와 **클라이언트 보안 비밀번호**가 뜸
   - 두 값을 복사해서 메모장에 임시로 저장

### 1-2. Supabase에 구글 Provider 등록

1. Supabase 대시보드 → **Authentication** → **Providers**
2. 목록에서 **Google** 찾아서 클릭
3. **Enable Sign in with Google** 토글 ON
4. **Client ID (for OAuth)**: 위에서 복사한 클라이언트 ID 붙여넣기
5. **Client Secret (for OAuth)**: 위에서 복사한 보안 비밀번호 붙여넣기
6. **Save** 클릭

✅ **구글 로그인 완료!**

---

## 2️⃣ 카카오 로그인 설정 (약 10분)

### 2-1. Kakao Developers에서 앱 만들기

1. https://developers.kakao.com 접속 → 카카오 계정으로 로그인
2. 상단 **내 애플리케이션** → **애플리케이션 추가하기**
   - 앱 아이콘: 생략 가능
   - 앱 이름: "정부정책알림" 같이 자유롭게
   - 사업자명: 개인 이름 또는 사업자명
3. 만들어진 앱 클릭 → 왼쪽 메뉴 **앱 설정 → 요약 정보**
   - **REST API 키** 복사해서 메모장에 저장
4. 왼쪽 메뉴 **앱 설정 → 플랫폼**
   - **Web 플랫폼 등록** 클릭
   - 사이트 도메인: 개발용은 `http://localhost:3000`, 배포 후엔 실제 도메인 추가
5. 왼쪽 메뉴 **제품 설정 → 카카오 로그인**
   - **카카오 로그인 활성화 설정** 토글 ON
   - **Redirect URI 등록**:
     ```
     https://<프로젝트ref>.supabase.co/auth/v1/callback
     ```
6. 왼쪽 메뉴 **제품 설정 → 카카오 로그인 → 동의항목**
   - **닉네임**: 필수 동의 (기본)
   - **카카오계정(이메일)**: **선택 동의** 또는 **필수 동의**
     - ⚠️ 선택 동의로 두면 사용자가 이메일 제공 거절 가능 → Supabase 가입 실패 가능성
     - **권장: 필수 동의로 설정** (심사 필요할 수 있음)
7. 왼쪽 메뉴 **앱 설정 → 보안**
   - **Client Secret**: **코드 생성** → 활성화 상태 **ON**
   - 생성된 Client Secret 복사해서 메모장에 저장

### 2-2. Supabase에 카카오 Provider 등록

1. Supabase 대시보드 → **Authentication** → **Providers**
2. 목록에서 **Kakao** 찾아서 클릭
3. **Enable Sign in with Kakao** 토글 ON
4. **Client ID (for OAuth)**: 위에서 복사한 **REST API 키** 붙여넣기
5. **Client Secret (for OAuth)**: 위에서 복사한 **Client Secret** 붙여넣기
6. **Save** 클릭

✅ **카카오 로그인 완료!**

---

## 3️⃣ 테스트하기

### 로컬 개발 서버 실행

```bash
npm run dev
```

### 브라우저에서 확인

1. http://localhost:3000/login 접속
2. **카카오로 계속하기** 버튼 클릭 → 카카오 로그인 창 → 동의 → 홈으로 돌아오기
3. **Google로 계속하기** 버튼 클릭 → 구글 로그인 → 동의 → 홈으로 돌아오기

### 로그인 상태 확인

Supabase 대시보드 → **Authentication** → **Users** 에서
로그인한 사용자가 추가되었는지 확인.

---

## ❗ 자주 발생하는 문제

### "redirect_uri_mismatch" 에러

Redirect URI가 정확히 일치하지 않음. 다음을 확인:
- Google Cloud Console의 **승인된 리디렉션 URI**
- Kakao Developers의 **Redirect URI**
- 둘 다 `https://<프로젝트ref>.supabase.co/auth/v1/callback` 과 **완전히 동일**해야 함
- 끝에 슬래시(/) 있고 없고도 중요

### 카카오 로그인 후 "User email not available" 에러

카카오 동의항목에서 **이메일**이 필수 동의로 설정되지 않음.
→ Kakao Developers → 제품 설정 → 카카오 로그인 → 동의항목에서 **이메일 필수 동의**로 변경.

### "Provider is not enabled" 에러

Supabase Dashboard에서 해당 Provider의 Enable 토글을 껐다 켜고 Save를 다시 눌러보세요.

### 로그인 후 홈으로 가는 대신 /auth/callback 주소가 보임

콜백 라우트에 문제. `app/auth/callback/route.ts` 가 존재하는지 확인.

---

## 🔐 프로덕션 배포 시 체크리스트

배포(Vercel 등)한 뒤에는 다음을 업데이트해야 해요:

1. **Google Cloud Console**
   - 승인된 리디렉션 URI에 프로덕션 도메인 추가:
     `https://<프로젝트ref>.supabase.co/auth/v1/callback` (동일)
   - 앱 공개 상태를 **프로덕션**으로 전환
2. **Kakao Developers**
   - Web 플랫폼에 프로덕션 도메인 추가: `https://yourapp.com`
3. **Supabase**
   - Site URL을 프로덕션 도메인으로 변경
   - Additional Redirect URLs에 프로덕션 도메인 추가
