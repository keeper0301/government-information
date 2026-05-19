# 거주지 정책 매칭 Phase B — 외부 수집 spec (2026-05-19)

> **작성일**: 2026-05-19
> **목적**: Phase A (district 컬럼 + extractor + 7,272건 백필, 메모리 [district-phase-a-2026-05-16]) 후속
> **개념**: 시·군 단위 외부 데이터 소스 추가 + extractor 정확도 강화

## 1. Phase A 현황 (2026-05-16 마감)

- `welfare_programs.district` + `loan_programs.district` 컬럼 추가
- `lib/programs/district-extractor.ts` 정규식 + 시·군 사전 매칭
- 7,272건 백필 완료 (사장님 순천시 47건 매칭 확인)
- 광역 검증 통과

## 2. Phase B 의 의미 — 3 영역 확장

### B-1. 외부 수집 소스 추가
현재 데이터 소스:
- 복지로 (welfare)
- youthcenter (청년정책)
- mss (소상공인)
- 시·군 보도자료 (Phase B 5/17 평택·순천 등)

**신규 외부 소스**:
- **정부24 API** — 시·군 정책 누락 채움 (`https://www.gov.kr/portal/onestopSvc/subsidy`)
- **행정안전부 보조금24 API** — 통합 보조금 정보
- 각 시청 RSS — 시·군 단위 보도자료 매주 (이미 17 광역 cron 가동, 시·군 확장)

### B-2. district extractor 정확도 강화
현 extractor 한계:
- 광역시·도 매칭 정확 (서울·부산·...)
- 시·군 매칭 정확 (순천·평택·...)
- 단 **읍·면·동 단위 미지원** — Phase B-2 에서 확장

신규:
- 읍·면·동 사전 추가 (행정안전부 통계 + 통계청 데이터)
- `lib/programs/district-extractor.ts` 의 정규식 + dictionary 확장
- 매칭 신뢰도 (high/mid/low) tier 도입

### B-3. 사장님 거주지 추천 알고리즘 강화
현 추천:
- 광역 매칭 (사장님 전남 → 전남 정책)
- 시·군 매칭 (사장님 순천 → 순천 정책)

**신규**:
- **거주지 정책 점수 가중치 자동 학습** — 사장님 클릭 데이터 기반 (이미 popularity_snapshot)
- **인접 시·군 정책 추천** — 사장님 순천 거주 시 광양·여수도 추천
- **거주지 변경 detection** — IP geolocation (Vercel header) + 사장님 명시 입력

## 3. 우선순위 + 구현 단계

### Stage 1 (1주, 5/26~) — B-2 extractor 강화
- 행안부 읍·면·동 사전 import (CSV → SQL seed)
- extractor 함수에 읍·면·동 매칭 추가
- 기존 7,272 row 재백필 → 신규 매칭 row 측정
- 테스트 — 사장님 순천 매월리 like 케이스

### Stage 2 (1주, 6/2~) — B-1 외부 수집 cron
- /api/cron/gov-kr-collect 신규 — 정부24 API 매일 KST 03:00
- /api/cron/bokjiro24-collect 신규 — 보조금24 매일 KST 04:00
- 중복 정책 dedupe (기존 dedupe-detect 와 통합)

### Stage 3 (1주, 6/9~) — B-3 추천 강화
- popularity_snapshot 의 district 별 weight 분석
- 인접 시·군 mapping table (행안부 행정구역 인접 데이터)
- 사장님 settings 페이지에 거주지 입력 + 자동 추출 (IP geo)

## 4. DDL 추가 (Stage 1)

```sql
-- migrations/092_district_dictionary.sql
CREATE TABLE district_dictionary (
  district text PRIMARY KEY,
  parent_district text REFERENCES district_dictionary(district),
  level int NOT NULL CHECK (level IN (1, 2, 3)), -- 1=광역, 2=시·군, 3=읍·면·동
  aliases text[]
);
CREATE INDEX idx_district_dict_parent ON district_dictionary(parent_district);
```

사장님 "DDL 092 apply" 명시 승인 필요.

## 5. 비용 분석

- 정부24 API: 무료 (공공 API)
- 보조금24 API: 무료
- 시청 RSS: 무료
- 읍·면·동 사전: 행안부 무료
- **총 신규 비용 0** — 사장님 운영비 영향 X

## 6. 사용자 가치

Phase A 후: 사장님 순천 47건 (광역 + 시·군)
Phase B 후 (예측): 사장님 순천 매월리 케이스 시 80~100건+ (읍·면·동 + 인접 광양·여수)

## 7. 다음 세션 명시 진행

사장님이 "Phase B 진행" 명시 시 다음 단계:
1. district_dictionary 행안부 CSV 다운로드 + sql seed
2. extractor 확장 + 테스트
3. 기존 7,272 row 재백필
4. 사장님 가시화 — /admin/autonomous 의 district coverage metric

## 참조

- 메모리: [[district-phase-a-2026-05-16]] — Phase A 완료
- 메모리: [[local-press-pyeongtaek-complete-2026-05-17]] — 시·군 보도자료 5 layer
- 코드: `lib/programs/district-extractor.ts` (확장 대상)
- 코드: `app/api/cron/scrape-local-press/route.ts` (참고)
