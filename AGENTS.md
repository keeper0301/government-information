<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## local-press collector 추가 가이드

신규 시·군 보도자료 collector 추가 시 아래 분기 룰 준수.

### factory(`createPressCollector`) 사용 — 표준 경로

조건 (모두 충족 시):
- GET fetch + 정적 HTML
- list/detail selector regex 로 추출 가능
- chromium fallback (Playwright) 으로 SPA 우회 가능

→ `lib/scraping/local-press/{city}.ts` 신규 + `_registry.ts` 한 줄 등록.

### 별도 파일 — 예외 경로 (gijang-eminwon 패턴)

다음 중 하나라도 해당하면 별도 파일:
- POST + form-urlencoded body 필요 (eminwon `OfrAction.do` 등)
- WebSocket / GraphQL / 비표준 transport
- 다단계 인증 (cookies + CSRF token chain)
- 사이트별 특수 ID 식별자 (`news_epct_no` 등) 가 factory URL slug 패턴과 비호환

별도 파일 의무 사항:
1. `ScrapeResult` 시그니처 정합 (`(admin, limit?) => Promise<ScrapeResult>`)
2. **단위 테스트 의무**: parser regex silent 회귀 방어 (예: `__tests__/lib/scraping/{city}.test.ts`)
3. `_registry.ts` 등록 + 같은 도시에 두 경로 (factory + 별도) 동시 등록 금지
   (dead-code 2 경로 anti-pattern, 메모리 `feedback_dead_code_two_paths`)
4. dead 파일 같은 commit 에 `git rm` (e883604 사고 패턴 회피)
5. 본문 cut `20000` + 본문 min `250` 통일 (factory `BODY_MIN_LEN` + AdSense P2 일관)
6. POST 호출 사이 `setTimeout(200)` polite delay (서버 부담 ↓)
