# Gemini 프로젝트 분리 가이드 (G3, 2026-05-17)

사장님 5분 GUI 작업. blog 발행 cap 사고 (5/14) 재발 근본 차단.

## 왜 분리하나

현재 모든 키 (4종) 가 **N8N Project (strong-augury-484111-t1)** 소속:
- nanobanana mcp (이미지 생성 ₩50K/월) ← 큰 비용
- keepioo blog ← 적은 비용 (₩3K)
- 둘이 같은 ₩100K cap 공유 → nanobanana 큰 사용 시 blog 발행 멈춤

**분리 효과**:
- keepioo 전용 프로젝트 = 별도 cap (예: ₩30K) → nanobanana 사고 영향 0
- blog 발행 단독 사용 → 사고 추적 명확

## 5분 작업 단계

### 1. AI Studio 에 keepioo 프로젝트 import

1. https://aistudio.google.com/apikey 접속
2. 우측 상단 **"API 키 만들기"** 클릭
3. dialog 에서 **"가져온 프로젝트 선택"** dropdown 클릭
4. **"프로젝트 가져오기"** 클릭
5. 새로 뜬 dialog 에서 **"keepioo"** 프로젝트 선택 → "가져오기"

→ 사장님 keepioo 프로젝트가 AI Studio 에 import 됨.

### 2. keepioo 프로젝트로 새 API 키 발급

1. 다시 **"API 키 만들기"** 클릭
2. dropdown 에서 **"keepioo"** 선택 (이제 보임)
3. 이름: **"keepioo blog (분리)"**
4. **"키 만들기"** → 키 복사 (한 번만 표시)

### 3. spending cap 설정 (keepioo 프로젝트)

1. AI Studio 좌측 메뉴 **"지출"** 클릭
2. 상단 Project dropdown 에서 **"keepioo"** 선택
3. **"지출 한도 수정"** → ₩30,000 입력 → 저장

→ keepioo 프로젝트 한도 ₩30K. N8N (₩100K) 와 격리.

### 4. Vercel env 갱신

1. https://vercel.com/keeper0301-8938s-projects/government-information/settings/environment-variables
2. 검색 "GEMINI" → GEMINI_API_KEY → kebab 메뉴 → Edit
3. 새 키 paste → Save
4. Deployments 탭 → 최신 → kebab → Redeploy → cache 미사용 → Redeploy

### 5. 검증

- `curl https://www.keepioo.com/api/publish-blog?count=1 -H "Authorization: Bearer $CRON_SECRET"` → HTTP 200 expected
- `https://aistudio.google.com/spend?project=keepioo` → blog 발행 비용 keepioo 에 누적

## 효과

- ✅ nanobanana 사고 (₩50K) 가 blog 발행 영향 0
- ✅ keepioo blog 비용 별도 추적 (월 ₩3K 수준)
- ✅ 5/14 사고 같은 2.5일 멈춤 재발 0
- ✅ G1 (Gemini 텔레그램 알림) 와 묶음 — 분리 + 사고 시 즉시 알림 2중 안전망
