# 광역 보도자료 → welfare 자동 등록 (C 옵션 spec)

## 배경

사장님 사고 보고 (2026-04-29):

> "순천시 고유가 지원금 왜 이 내용은 복지에 없어?"

진단:
- `welfare_programs` 0건 / `loan_programs` 0건
- `news_posts` 10+ 건 (전남도 "고유가 피해지원금" 뉴스 다수)
- 즉 자동 수집은 **뉴스로만** 잡고 **welfare 카테고리에는 미반영**

근본 원인:
- 자동 수집 출처 (보조금24·복지로·기업마당·youth-v2·bokjiro) 는 **중앙·범국가 데이터**
- 광역도 자체 신규 사업 (전남·서울·경기 등) 은 광역도 → 중앙 데이터 등재까지 시간차 (수일~수주)
- 이미 `news_posts` 에 들어왔으니, 본문 분류만 하면 자동으로 welfare 추가 가능

A (수동 등록 폼) 은 사장님이 직접 발견한 케이스만 처리. C (자동 분석) 는
모든 광역 자체 사업을 자동 흡수.

## 목표

`news_posts` 에 들어온 광역도 발표 보도자료 중 **정책 (지원금·바우처·신청 가능
사업)** 을 자동 분류 → `welfare_programs` 에 신규 row 등록.

## 비목표

- 일반 정책 동향 뉴스 (예: "전남도 고유가 대응 회의 개최") 는 제외
- 광역도 외 일반 언론사 뉴스 자체 분류 X
- 본문에 신청 정보 (URL·기간·자격) 가 명확하지 않으면 등록 X (정확도 우선)

## 구조 (3 layer)

### Layer 1 — 후보 필터 (cron 매일, 비용 0)

`news_posts` 24h 신규 row 중:
- `ministry` 가 광역도 (전라남도·경기도·서울특별시 등 17 광역)
- `title` 또는 `summary` 에 **신청 가능 신호** 키워드 ≥1:
  - "지원금·보조금·바우처·수당·환급·지원사업·모집·신청·접수"
- `category` 가 'press' 가 아닌 (이미 차단됨)

수십~수백 건/일 추정.

### Layer 2 — LLM 분류 (Claude API 또는 다른 LLM, 비용 발생)

후보 본문 (title + summary + body) 을 LLM 에 전달:

**Prompt 골자**:
```
다음 보도자료가 일반 사용자가 직접 신청 가능한 "정책 사업" 인지 판단.
JSON 으로 반환:
{
  "is_policy": boolean,
  "title": string,           // 정책 공식 명칭
  "target": string,          // 누가 받나
  "eligibility": string,     // 자격 상세
  "benefits": string,        // 무엇을 받나
  "apply_method": string,    // 어떻게 신청
  "apply_url": string|null,  // 신청 URL (보도자료에 있다면)
  "apply_start": string|null,// YYYY-MM-DD
  "apply_end": string|null,  // YYYY-MM-DD
  "category": "생계|의료|양육|교육|취업|주거|문화|창업"
}

is_policy=false 인 경우 (예: 정책 회의 보도, 통계 발표) 나머지 필드 무시.
```

비용 추정:
- Claude Haiku 4.5 input ~2,000 tok / output ~500 tok
- 100건/일 → ~$0.10/일 → ~$3/월

### Layer 3 — 검증 + 등록 (cron 후속, 비용 0)

LLM 결과 검증:
- `is_policy=false` → skip
- `apply_url=null` → skip (사용자 행동 불가능)
- `category` 가 화이트리스트 외 → skip
- 중복 검사: `welfare_programs` 에 동일 `title` + `region` row 존재 → skip

통과한 row 만 `welfare_programs` INSERT:
- `source_code = 'auto_press_ingest'`
- `source_id = news_posts.id` (역추적 가능)
- 매칭 태그 (region/age/occupation/benefit/household) 는 A 와 동일 자동 분류

## 운영 가시화

`/admin/press-ingest` 신규:
- 24h ingest 결과: 후보 N → LLM 통과 M → INSERT K
- 최근 30건 테이블 (정책명·is_policy·skip 사유)
- 수동 trigger 버튼 (사장님이 즉시 실행)

## 마이그레이션

신규 0 (기존 컬럼만 사용).

## 환경변수

- `ANTHROPIC_API_KEY` (또는 다른 LLM) — Layer 2 호출용

## 측정 지표

운영 시작 14일 후 측정:
- 신규 등록 정책 수 (vs 전체 welfare_programs 24h 증가)
- 사용자 클릭률 (manual_admin / auto_press_ingest / 자동 수집 비교)
- LLM 비용 / 등록 1건당 cost
- 오등록률 (사장님이 admin 페이지에서 수동 hidden 처리한 비율)

## 단계별 구현

| Step | 작업 | 추정 |
|------|------|------|
| 1 | Layer 1 후보 필터 (lib/press-ingest/filter.ts) + 단위 테스트 | 1시간 |
| 2 | Layer 2 LLM 호출 (lib/press-ingest/classify.ts) + ANTHROPIC_API_KEY 가드 | 2시간 |
| 3 | Layer 3 검증 + INSERT (lib/press-ingest/ingest.ts) + 중복 검사 | 1시간 |
| 4 | /api/cron/press-ingest 신규 + vercel.json 등록 (매일 09:30 KST) | 30분 |
| 5 | /admin/press-ingest 가시화 페이지 | 1.5시간 |
| 6 | 14일 운영 후 정확도 측정 + 임계치 튜닝 | (운영 단계) |

총 6시간 작업 + 14일 운영 후 측정.

## 리스크

- **오등록**: LLM 이 정책이 아닌 보도를 정책으로 분류 → 잘못된 정책이 사용자에게 노출
  - 완화: `is_policy=false` skip + `apply_url=null` skip + 사장님 수동 hidden 도구
- **중복 등록**: 동일 정책이 여러 보도자료로 다중 발표 → 같은 정책 N번 등록
  - 완화: 동일 title + region 중복 검사 + manual_admin / auto_press_ingest 우선순위
- **LLM 비용 폭주**: 후보 필터 헐거우면 비용 ↑
  - 완화: 신청 가능 신호 키워드 strict + 24h 후보 cap 100건
- **광역도 보도자료 RSS 출처 부족**: 현재 korea.kr + 일부 언론사만 수집
  - 완화: 별건 — 광역도 RSS 추가 (전남·경기·서울 도청 RSS 등재)

## 다음 액션

- A 옵션 (`/admin/welfare/new` 수동 등록 폼) 먼저 운영 → 사장님이 직접 등록한 정책의
  pattern 관찰 → C 옵션 LLM prompt 튜닝에 반영
- 14일 후 사장님이 수동 등록한 N건 vs auto_press_ingest 가 자동 분류했어야 할 M건
  비교 → C 진행 가치 검증
