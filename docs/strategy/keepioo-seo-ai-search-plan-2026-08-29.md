# keepioo SEO·AEO·GEO·LLMO·NEO 실행 플랜

- 작성일: 2026-08-29
- 적용 스킬: `fire-your-seo-agency` v1.1.0
- 대상: https://www.keepioo.com
- 원칙: 백링크 구매·댓글 자동화·클로킹·숨긴 텍스트 금지. 크롤러가 JS 없이 읽는 HTML과 실제 측정값 기준.

## 0. 설치·보안 검토 결과

`https://github.com/leopard627/fire-your-seo-agency`는 Claude/Hermes용 문서형 스킬입니다.

- 파일: Markdown 중심, 실행 스크립트 없음
- 라이선스: MIT
- 위험 스크립트: 없음
- 비밀값 읽기: 없음
- 외부 요청: 예시 `curl https://example.com` 및 문서 링크 수준
- 결론: keepioo 프로필 스킬로 설치 가능

설치 위치:

- `/home/user/.hermes/profiles/keepioo/skills/research/fire-your-seo-agency/`

## 1. 현재 크롤러 눈 진단

2026-08-29 기준 live readback:

| 레인 | 상태 | 근거 |
|---|---|---|
| SEO | 양호+주의 | 홈 HTML은 SSR로 h1·메타·JSON-LD가 노출됨. AdSense review mode 때문에 sitemap은 32 URL로 제한되어 대량 상세 색인은 보류 중. |
| AEO | 보강 필요 | 상세 페이지 JSON-LD 기반은 있으나 질문형 랜딩과 첫 문단 직답 구조를 더 늘려야 함. |
| GEO | 즉시 보강 완료 | `/llms.txt` 존재. 이번 작업에서 AI 크롤러 정책과 llms 설명을 보강함. |
| LLMO | 보강 필요 | `keepioo`, `키피오`, `정책알리미` 별칭은 있으나 외부 표면과 sameAs를 더 연결해야 함. |
| NEO | 보강 필요 | Yeti 허용은 존재. 네이버 서치어드바이저 등록·수집 요청·AI 브리핑 질문 측정은 계정 기반 후속 필요. |

## 2. 이번 코드 반영

### 2.1 AI 크롤러 허용 정책 확장

`app/robots.ts`에 fire-your-seo-agency의 GEO 분류를 반영했습니다.

추가 또는 명시 강화 대상:

- `OAI-SearchBot`
- `Claude-SearchBot`
- `Claude-User`
- `Perplexity-User`
- `Applebot-Extended`
- `CCBot`

기존 허용 유지:

- `GPTBot`
- `ChatGPT-User`
- `ClaudeBot`
- `Claude-Web`
- `PerplexityBot`
- `Google-Extended`
- `Bytespider`
- `Yeti`, `Yeti-Mobile`, `NaverBot`, `Daum`, `Daumoa`

### 2.2 `/llms.txt` 보강

`public/llms.txt`를 AI 검색·생성엔진 친화적으로 정리했습니다.

주요 변경:

- keepioo가 1차 소스로 제공하는 데이터 정의 추가
- 핵심 기능과 주요 페이지를 AI가 읽기 쉬운 라벨 구조로 정리
- AdSense review mode에서는 sitemap이 가이드·허브 중심으로 제한된다는 설명 추가
- live ads mode에서 대량 URL이 복구된다는 설명 추가
- 최종 신청 전 원문 공고 확인 필요 문구 추가
- 인용 권장 표기 추가

## 3. 다음 구현 우선순위

### P0 — 배포 후 크롤러 readback

- `/robots.txt`에서 신규 AI 봇 허용 확인
- `/llms.txt`에서 새 안내 문구 확인
- `/sitemap.xml` URL 수와 review-mode 제한 상태 확인
- `/없는페이지`가 404 또는 올바른 not-found 흐름인지 ASCII/한글 경로 모두 확인

### P1 — 질문형 랜딩 6종

검색 질문 하나 = 페이지 하나 원칙으로 가이드/허브 랜딩을 늘립니다.

추천 후보:

1. `/guides/small-business-support-2026`
   - 질문: 2026년 소상공인 지원금 뭐 받을 수 있나요?
2. `/guides/youth-monthly-rent-2026`
   - 질문: 청년 월세 지원 신청 조건은 뭔가요?
3. `/guides/low-income-benefits-checklist`
   - 질문: 저소득층 복지 혜택은 어디서 확인하나요?
4. `/guides/new-business-loan-checklist`
   - 질문: 창업자 정책자금 신청 전에 뭘 확인해야 하나요?
5. `/guides/policy-deadline-calendar`
   - 질문: 이번 달 마감되는 정부지원사업은 어디서 보나요?
6. `/guides/naver-ai-briefing-policy-sources`
   - 질문: 네이버 AI 브리핑이 인용하기 좋은 정책 정보는 어떤 구조인가요?

각 페이지 기준:

- h1과 URL에 질문 의도 직접 반영
- 첫 문단 40자 안팎 직답
- 표 또는 라벨-값 그리드 포함
- 공식 출처 링크 포함
- FAQ 3~5개 + 가시 텍스트와 동일한 FAQPage JSON-LD
- sitemap 포함 여부 명시

### P2 — 공고 상세 AEO 구조 강화

`/welfare/[id]`, `/loan/[id]` 상세에 다음 라벨을 화면에 더 분명히 노출합니다.

- 대상
- 지원 내용
- 신청 기간
- 신청 방법
- 원문 출처
- 기준일
- 자격 주의사항

목표는 네이버 AI 브리핑과 Perplexity가 문단 단위로 인용하기 쉬운 구조입니다.

### P3 — 브랜드 엔티티 정리

- Organization JSON-LD의 `sameAs` 후보 확장
  - Instagram 공식 계정 유지
  - Naver Blog 공식 표면이 있으면 추가
  - GitHub 또는 공개 소개 페이지가 있으면 추가
- `정책알리미`, `keepioo`, `키피오` 표기를 모든 public page에서 일관화
- `/about`에 “무엇의 1차 소스인지” 문장을 추가

### P4 — 측정 루프

변경 직후와 14일 뒤를 비교합니다.

측정 항목:

- GSC 최근 28일 노출·클릭·CTR
- Naver Search Advisor 노출·클릭·검색어
- Bing `site:www.keepioo.com` 색인 여부
- AI 인용 질문 8개 O/X
- Vercel/로그에서 AI 크롤러 방문 여부

추천 재측정일: 2026-09-12

## 4. 승인·계정 필요 항목

아래는 사이트 코드만으로 끝나지 않아 별도 확인이 필요합니다.

- Bing Webmaster Tools 등록 및 sitemap 제출
- Naver Search Advisor 등록 및 수집 요청
- GSC 기준선 숫자 확인
- Naver 웹마스터 기준선 숫자 확인
- ChatGPT/Perplexity/네이버 AI 브리핑 실제 질문 테스트

## 5. 하지 않을 것

- 백링크 구매
- 서로이웃·댓글 품앗이 자동화
- 숨긴 텍스트·클로킹
- 화면에 없는 JSON-LD 삽입
- 상위 노출 보장 문구
