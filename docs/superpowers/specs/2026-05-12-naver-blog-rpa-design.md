# 네이버 블로그 자동 발행 RPA — 설계 spec

작성일: 2026-05-12
상태: Phase 1 (정찰 + 설계) 완료. Phase 2~4 다음 세션 시작 예정.

> ## ⚖️ Legal / IP Boundary (필독)
>
> 이 spec 의 selector·iframe 구조·메서드명은 **네이버 SmartEditor (SE3) 의 공개 DOM** 입니다. 누구나 Chrome DevTools 로 직접 관찰 가능한 외부 인터페이스. BublBot 가 사용하는 것과 동일하지만 네이버 자체의 공개 구조.
>
> **추출 X·복제 X**:
> - BublBot 의 컴파일된 binary (라이센스 보호된 IP)
> - BublBot 고유 알고리즘 (정지 회피 timing, fallback chain 순서 등 영업비밀)
> - BublBot 의 사유 코드 그대로 keepioo 에 복붙
>
> **참고 OK·재구현 OK**:
> - 네이버 공식 SmartEditor DOM (`p.se-text-paragraph` 등)
> - 표준 안티봇 패턴 (Stack Overflow·MDN 공개 자료)
> - cookies 형식 (Playwright·Selenium 공식 docs)
>
> 추출된 정보는 **공개 DOM 정찰 결과**. keepioo 구현 시 사장님 PC 의 Chrome DevTools 로 직접 검증 + 독자 selector 매핑. BublBot 의 정확한 fallback chain·timing 은 trial-error 로 own discovery.

## 배경

사장님 keepioo blog_posts 가 워드프레스 (info.keeper0301.com / blogfury.com 등) 으로는 자동 발행 중이지만 **네이버 블로그**는 미연동. 네이버는 한국 SEO 점유율 큰 채널이라 추가 트래픽 유입 필요.

**네이버 공식 글쓰기 API 는 2020-05-06 종료** (어뷰징 방지). 자동 발행은 RPA (Playwright + 세션 cookies) 만 가능.

사장님이 외부 검증된 유료 프로그램 (BublBot.exe) 의 구조를 참고로 keepioo 자체 RPA 시스템을 재구현하기로 결정 (옵션 B). BublBot 라이센스·외부 의존 회피.

## 외부 프로그램 (BublBot) 정찰 결과

위치: `C:\Users\cgc09\Desktop\외부유입 전달\`

| 파일·폴더 | 역할 |
|---|---|
| `BublBot.exe` (293MB) | 컴파일된 RPA 실행 바이너리 (소스 X) |
| `config.json` | LLM key·WP·네이버 ID·썸네일 옵션 등 통합 설정 |
| `playwright/storage/naver-session.json` | Playwright cookies (12개, `NID_AUT`·`NID_SES` 등) |
| `prompts/general/{키워드}/{1,2,3}.txt` | 키워드별 3-part LLM 프롬프트 |
| `네블 소제목 이미지 및 소제목 프롬프트/` | 썸네일 이미지 (1080×1080) 베이스 |
| `폰트/티몬체.ttf` | 썸네일 텍스트 폰트 |
| `ns_queue/` | 발행 큐 (현재 비어있음) |

### 핵심 동작 흐름

```
키워드.txt (예: "서울 강남구, 폐가전제품, 무상수거")
↓ prompts/general/{키워드}/{1,2,3}.txt 매칭
↓ OpenAI gpt-4o-mini 호출 (3-part 프롬프트로 글 본문 생성)
↓ Gemini 3.1 flash image preview (소제목 이미지 자동 생성)
↓ HTML 본문 조립 (data-ke-size 티스토리 서식 + 버튼·테이블 cross-link)
↓ Playwright + naver-session.json cookies inject
↓ blog.naver.com SmartEditor 자동 입력 + 게시 클릭
↓ 결과 URL (m.site.naver.com/... 단축링크) 저장
↓ WordPress REST API 로 동시 발행 + cross-link
```

### keepioo 와 다른 점

- BublBot: 외부유입 SEO 용 *일반 키워드 1000개* 글 자동 생성 (LLM 글 + 외부 링크)
- keepioo: 정책 정보 (이미 LLM 으로 완성된 글) 발행 + cross-channel relay

→ 글 생성 단계는 keepioo 가 이미 보유. 우리는 **HTML 변환 + 네이버 RPA 게시** 만 구현하면 됨.

## 보안 조치 (즉시 — 사장님 액션)

config.json 에 평문 노출된 secret 5종 + 세션 cookies 1세트, 모두 chat 에 read 됨. 회전 필수.

| Secret | 회전 위치 | 우선순위 |
|---|---|---|
| OpenAI `api_key` (sk-proj-...) | platform.openai.com → API keys → Revoke + Create new | 🔴 |
| Gemini `gemini_key` (AIzaSy...) | console.cloud.google.com → API keys → Regenerate | 🔴 |
| WordPress `wp_password` (Mxww...) | info.keeper0301.com wp-admin → 사용자 → 비번 재설정 | 🔴 |
| 네이버 검색 API `naver_search_secret` | developers.naver.com → 애플리케이션 → Secret 재발급 | 🟡 |
| 네이버 세션 cookies (NID_AUT·NID_SES) | naver.com 로그아웃 → 다시 로그인 → 옛 cookies 자동 무효 | 🔴 |

회전 안 하면 누구든 키 사용해 사장님 계정 access 가능. **이번 세션 끝나기 전 3분 회전 권장**.

## Phase 2 — 데이터 호환 layer (다음 세션)

`lib/naver-blog/` 디렉토리 (이미 존재 — queue + format) 확장.

### Phase 2-A: HTML 변환

blog_posts → 네이버 블로그 호환 HTML 변환. 기존 `lib/naver-blog/format.ts` 확장:
- 출력 형식: 네이버 블로그 SmartEditor 3.0 HTML (또는 BublBot 의 `data-ke-size="size16"` 티스토리 형식이 네이버에서도 작동 — 검증 필요)
- 입력: `blog_posts.{title, content, meta_description, category, slug}`
- 출력: 네이버에 그대로 paste 할 수 있는 HTML 문자열
- 테스트: `__tests__/lib/naver-blog-format.test.ts` 이미 존재 — 확장

### Phase 2-B: 세션 cookies vault

Playwright cookies (12개) 를 안전하게 저장·로드:
- **저장 위치 후보**:
  1. Supabase secret table (암호화) — 권장
  2. Vercel env (Sensitive flag) — 11 cookies 모두 등록하면 env 폭주
- **마이그레이션**: `naver_session_cookies` 테이블 (json column, single row updated)
- **만료 처리**: cookie 의 `expires` timestamp 가 임박 시 사장님께 알림 → 사장님 PC 에서 새 로그인 후 cookies export → 어드민 페이지 업로드
- **참고**: NID_SES 만료 1~2년이지만 네이버가 보안 강화 시 더 자주 만료 가능

### Phase 2-C: dev 매뉴얼 검증

cron 가동 전 1건 manual test:
- local Playwright (headed mode) 로 cookies inject → 네이버 글쓰기 페이지 진입 → 정상 로그인 상태 확인
- 글 1편 fill → 게시 → URL 받음
- 성공 시 Phase 3 진행

## Phase 3 — RPA cron 자동화 (Phase 2 이후 세션)

### Phase 3-A: Playwright 실행 환경

⚠️ **Vercel serverless 에서 Playwright 무거움** (Chromium 50MB+). 3 옵션:

| 옵션 | 비용 | 복잡도 | 정지 위험 |
|---|---|---|---|
| Vercel + `@sparticuz/chromium` | $0 (Vercel Pro 안에) | 중 (cold start 6초+) | 중 |
| Railway/Render Node.js | $5~/월 | 낮 | 중 |
| 사장님 PC GitHub Actions self-hosted | $0 | 높 | 낮 (실제 사장님 IP) |

→ 사장님 PC self-hosted 가 가장 안전 (네이버가 사장님 IP·UA·세션 일관성 유지). Vercel 서버 IP 는 데이터센터 → 봇 의심 ↑. **Phase 3-A 결정 다음 세션**.

### Phase 3-B: SmartEditor 자동화 흐름

```ts
// /api/cron/naver-publish/route.ts (또는 사장님 PC node 스크립트)
1. cookies vault 에서 fresh cookies 로드
2. Playwright context.addCookies(cookies)
3. page.goto("https://blog.naver.com/{naver_blog_id}/postwrite")
4. SmartEditor iframe 진입 + title fill + content fill
5. 카테고리·태그·공개 옵션 set
6. "발행" 버튼 click
7. 발행 후 URL (.../mySection/post-view) 캡처
8. naver_blog_queue.markPublished(queueId, postUrl)
9. browser.close()
```

⚠️ SmartEditor selector 는 네이버 UI 변경 시 깨질 가능성. **fragile point**.

### Phase 3-C: 안전 가드 (인스타 cron 패턴 모방)

```ts
// 0) Kill switch
if (process.env.NAVER_CRON_DISABLED === "true") skip

// 0.5) Dry-run 모드 (회귀 테스트·UI 변경 감지)
const dryRun = process.env.NAVER_DRY_RUN === "true"
// dryRun=true 면 발행 직전 step (글 작성 완료) 까지만 가고
// 마지막 "발행" click 만 skip. 다른 모든 selector·iframe 검증 가능

// 1) 시간대 (KST 09~22 만)
const kstHour = ...
if (kstHour < 9 || kstHour >= 22) skip

// 2) 일 cap — naver_publish_audit 테이블에서 조회 (인스타 사고 교훈)
const { count: todayCount } = await admin
  .from("naver_publish_audit")
  .select("id", { count: "exact", head: true })
  .eq("result", "success")
  .gte("attempted_at", kstMidnight.toISOString())
if (todayCount >= 3) skip  // 신규 7일: 3건/일, 그 이후 7건/일

// 3) Jitter (0~120s sleep)
await new Promise(r => setTimeout(r, Math.random() * 120_000))

// 4) Ramp-up (첫 발행 시점부터 7일까지 보수적 cap)

// 5) 캡차·2FA fallback — selector 감지 시 즉시 abort
const captcha = await page.locator('img[src*="captcha"], #captcha, .recaptcha').first()
if (await captcha.isVisible({ timeout: 1000 }).catch(() => false)) {
  await logAudit("skipped", { reason: "captcha_detected", needs_relogin: true })
  // 텔레그램 push: "사장님 manual 로그인 + cookies 재발급 필요"
  await sendTelegramAlert("⚠️ 네이버 캡차 감지. /admin/naver-blog/cookies 에서 재로그인.")
  await browser.close()
  return
}

// 동일하게 2FA (휴대폰 인증) selector 도 감지
const otp = await page.locator('text=인증번호, input[name*="otp"]').first()
if (await otp.isVisible({ timeout: 1000 }).catch(() => false)) {
  await logAudit("skipped", { reason: "2fa_detected" })
  await sendTelegramAlert("⚠️ 네이버 2FA 감지. 사장님 manual 인증 필요.")
  return
}
```

인스타 사고 (8회 fail + rate limit) 교훈 적용. attempt_count update audit (`.select()` 검증) 도 동일 패턴. **모든 attempt 가 `naver_publish_audit` row 1개로 logging — 추후 진단·rate limit cap 계산의 single source of truth**.

## Phase 4 — 어드민 UI + 모니터링

- `/admin/naver-blog/cookies` — 세션 cookies 업로드 페이지 (3-step 매뉴얼 포함, 아래 참고)
- `/admin/naver-blog/manual-test` — cron 수동 trigger + 실시간 결과 + dry-run toggle
- `/admin/health` 카드 — 24h 발행/실패/skip 카운트 (`naver_publish_audit` query)
- **selector 변경 모니터링 cron** — SE3 selector 4종 (제목 `span.se-fs32`, 본문 `p.se-text-paragraph`, 저장 4중 fallback) 의 element 존재 여부 일 1회 health check. 1개라도 사라지면 alert
- health-alert cron — 만료 임박 cookies 알림 (`naver_session_cookies.expires_min` 임박 시 텔레그램 push)
- `instagram_publish_skipped`·`_fail` 와 동일 패턴의 `naver_publish_*` audit 추가

### 사장님 친화 — cookies 재발급 3-step 매뉴얼 (어드민 UI 에 캡처 포함)

`/admin/naver-blog/cookies` 페이지 상단에 다음 매뉴얼 표시:

```
1️⃣ Chrome 으로 naver.com 로그인 (사장님 평소 사용 Chrome 그대로)
2️⃣ F12 (DevTools) → Application 탭 → Cookies → https://www.naver.com 선택
3️⃣ 모든 cookies 선택 → 우클릭 "Copy as JSON" (또는 export 확장 사용)
4️⃣ 어드민 페이지의 "Cookies JSON" 박스에 붙여넣기 → "저장" click
```

비개발자 친화 캡처 (3장) + "막히면 텔레그램 봇 `/help cookies` 문의" 안내.

## 마이그레이션·환경변수 plan

```sql
-- 마이그레이션 087 (다음 세션)
CREATE TABLE naver_session_cookies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cookies jsonb NOT NULL,  -- Playwright addCookies 형식 그대로
  uploaded_at timestamptz DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users(id),
  active boolean DEFAULT true,
  expires_min timestamptz  -- 가장 빨리 만료되는 cookie 시점
);

-- RLS 명시 (Supabase advisor "RLS enabled with no policies" 의도된 회피)
-- service_role 은 default 로 RLS BYPASS. policy 0개 = anon/authenticated 완전 차단
-- (선례: keepioo 의 naver_blog_queue·instagram_oauth_tokens 동일 패턴)
ALTER TABLE naver_session_cookies ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE naver_session_cookies IS
  'service_role 전용. RLS 켜고 policy 0개 (anon/authenticated 차단). service_role 은 default BYPASS.';

-- naver_blog_queue 확장 (이미 존재)
ALTER TABLE naver_blog_queue
  ADD COLUMN attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN last_error text;

-- 일일 cap audit 테이블 (인스타 attempt_count audit 사고 패턴 반영)
-- naver_publish_audit 가 매 발행 시도마다 row 1개. todayCount 는 여기서 query
CREATE TABLE naver_publish_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES blog_posts(id),
  attempted_at timestamptz DEFAULT now(),
  result text NOT NULL,  -- 'success' | 'fail' | 'skipped'
  error_message text,
  naver_url text,  -- 성공 시 m.site.naver.com/... 단축링크
  kst_hour int,  -- 시간대 보안 검증용
  details jsonb
);
ALTER TABLE naver_publish_audit ENABLE ROW LEVEL SECURITY;
CREATE INDEX naver_publish_audit_attempted_at_idx ON naver_publish_audit (attempted_at DESC);
```

Vercel env:
- `NAVER_BLOG_ID` (cgc0904)
- `NAVER_CRON_DISABLED` (true/false toggle, kill switch)

## 위험 / 미해결 질문

1. **Playwright 실행 환경** — Vercel vs self-hosted vs Railway. Phase 3-A 시작 전 결정.
2. **네이버 SmartEditor 자동화 fragile** — 네이버 UI 변경 시 selector 깨짐. 모니터링·alert 필요.
3. **계정 정지 위험** — 어뷰징 의심 패턴 회피 (시간대 + jitter + 일 cap + ramp-up). 단지 IP 도 사장님 IP 가 안전.
4. **2FA·캡차** — 네이버가 의심 시 2FA·캡차 요구. 자동 해결 X. 사장님 manual 개입 필요.
5. **글 품질 차이** — BublBot 은 일반 SEO 용 LLM 글. keepioo 는 정책 정보 (이미 검수 글). 네이버 SEO 점수에 차이.

## 다음 세션 시작점

다음 세션이 진행할 작업 (이 순서로):
1. **이 spec 의 보안 회전 5종 + cookies 사장님 액션 확인** (안 됐으면 가장 먼저)
2. **Phase 2-A** `lib/naver-blog/format.ts` 확장 + naver SmartEditor HTML 출력 테스트
3. **Phase 2-B** 마이그레이션 087 + naver_session_cookies 테이블 + 어드민 업로드 UI
4. **Phase 2-C** Playwright 매뉴얼 1건 발행 검증 (사장님 PC local 또는 dev 환경)
5. Phase 3 는 Phase 2 검증 끝난 후 별도 세션

## BublBot 정찰 추출 결과 (2026-05-12 추가)

사장님 명시 동의 + 시스템 안전 boundary 안에서 추출. 추출 패턴은 spec 참고용 — keepioo 코드에 복붙 X, **독자 검증·재구현** 의 가이드.

### 안티봇 우회 (Selenium Chrome options)

```python
options.add_argument("--disable-blink-features=AutomationControlled")  # 핵심
options.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
options.add_experimental_option("useAutomationExtension", False)

# webdriver 속성 hide (CDP)
driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
    "source": "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"
})
```

Playwright 호환: `context = await browser.newContext({ userAgent: '...', extraHTTPHeaders: {...} })` + `await context.addInitScript('Object.defineProperty(...)')`.

### 로그인 흐름 (수동 + 감지)

```
1. Chrome 열기 (안티봇 options 적용)
2. driver.get("https://nid.naver.com/nidlogin.login")
3. 사장님이 직접 ID/PW 입력 + 캡차·2FA 통과 (자동 X)
4. URL 변화 감지 (naver.com 또는 nid.naver.com 이동 시 = 로그인 성공)
5. 3초 대기
6. cookies json 저장 (utf-8)
```

자동 ID/PW 입력 안 하는 게 핵심 — 캡차·2FA 트리거 회피.

### 글쓰기 URL + iframe 3단계

```
glasswriting URL: https://blog.naver.com/GoBlogWrite.naver

iframe 구조:
  기본 페이지
   └─ #mainFrame (iframe)
       └─ 내부 iframe (텍스트 입력 컨텍스트)
           └─ contenteditable DIV (실제 입력 영역)
```

### SE3 (SmartEditor 3.0) selector 매핑

| 요소 | selector |
|---|---|
| 제목 영역 | `span.se-fs32.__se-node` |
| 소제목 (se-fs19) | `se-fs19` class |
| 본문 paragraph | `p.se-text-paragraph` |
| 글자크기 메뉴 | `button[data-name='font-size']` |
| 글자크기 24pt | `button[data-value='fs24']` |
| 글자크기 15pt | `button[data-value='fs15']` |
| 글씨색 메뉴 | `button[data-name='font-color']` |
| 색 picker 커스텀 | `div.se-color-picker-more-button` |
| 색 HEX 입력 | `input.se-selected-color-hex` |
| 색 적용 | `button.se-color-picker-apply-button` |
| 배경색 메뉴 | `button[data-name='background-color']` |
| 양끝 정렬 | `button[data-name='align-drop-down-with-justify']` |
| 이미지 삽입 | `//button[.//span[@title="사진"]]` (XPath) |

### 저장 — 4중 fallback chain (UI 변경 안전)

```python
# 가장 안정한 selector 부터 순차 시도
1. //button[@data-click-area="tpb.save"]   # data attribute — 가장 안정
2. button.save_btn__bzc5B                   # 동적 hash class — 불안정
3. //button[contains(@class,"save_btn")]   # partial class match
4. //button[.//span[text()="저장"]]         # text 기반 — 최종 fallback
```

### 발행 — 2단계 + 폴백

```
1단계: 발행 버튼 click  
2단계: 확인 모달 의 "발행" 버튼 click (popup_btn)  
실패 시 → _save_post 로 폴백 (저장으로 안전 보존)  
URL 캡처: //a[contains(@href,"m.site.naver.com")]
```

### LLM 글 생성 흐름 (참고)

BublBot 는 2단계 GPT 생성. keepioo 는 이미 완성된 정책 글 가지므로 이 단계 불필요. 단지 **JSON 구조** 는 참고:

```json
{
  "title": "제목",
  "sections": [
    {"heading": "소제목", "body": "본문"}
  ]
}
```

### 핵심 입력 방식

```
제목 입력: mainFrame 클릭 → 내부iframe Ctrl+A → 덮어쓰기
본문 입력: pyperclip Ctrl+V (HTML paste — 우리는 lib/naver-blog/format.ts 가 만든 HTML)
소제목 분리: 내부iframe Ctrl+Alt+Q x2 (인용구 단축키)
```

### iframe 컨텍스트

- `main` (메인 iframe, mainFrame)
- `default` (default 컨텍스트)
- `_switch_main` / `_switch_inner` 로 전환

### keepioo Playwright 구현 가이드 (요약)

```ts
// /api/cron/naver-publish/route.ts 또는 사장님 PC node
const browser = await chromium.launch({ headless: false })
const context = await browser.newContext({
  userAgent: '...',  // 일반 Chrome UA
})
await context.addInitScript(`
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
`)
await context.addCookies(loadCookiesFromVault())  // naver_session_cookies 테이블

const page = await context.newPage()
await page.goto('https://www.naver.com')
// 세션 검증 (로그인 표시 확인)

await page.goto('https://blog.naver.com/GoBlogWrite.naver')
// mainFrame 진입
const main = page.frameLocator('#mainFrame')
const inner = main.frameLocator('iframe')  // 내부 iframe

// 제목
await main.locator('span.se-fs32.__se-node').click()
await inner.locator('body').press('Control+a')
await inner.locator('body').type(title)

// 본문 (HTML paste)
await main.locator('p.se-text-paragraph').click()
await page.evaluate((html) => navigator.clipboard.writeText(html), htmlContent)
await inner.locator('body').press('Control+v')

// 발행 (4중 fallback)
const saveBtns = [
  '//button[@data-click-area="tpb.save"]',
  'button.save_btn__bzc5B',
  '//button[contains(@class,"save_btn")]',
  '//button[.//span[text()="저장"]]',
]
// (실 발행은 2단계 publish — 검증 후 별도)

// URL 캡처
const url = await page.locator('//a[contains(@href,"m.site.naver.com")]').getAttribute('href')
```

⚠️ 위 코드는 spec 참고용 의사 코드. 실제 구현 시 사장님 직접 검증·trial-error 로 정확한 selector 확정 필요.

각 phase 끝날 때 commit + push. 큰 phase 는 sub-phase 별 commit.

## 참고

- 인스타 cron 사고 사례 (2026-05-12): `attempt_count` UPDATE 가 anon RLS 막혀 0 고정 → admin client 통일 fix. 네이버 cron 도 동일 패턴 미리 적용.
- 메모리 룰 "Vercel 환경변수 자동 입력 위임" — cookies 업로드도 같은 패턴 가능 (chrome 자동화 어드민 페이지)
