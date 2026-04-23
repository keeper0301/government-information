-- ============================================================
-- 007: welfare_programs / loan_programs 확장
-- ============================================================
-- 목적: 다중 API 소스 수집 + 표준 태그 기반 맞춤 알림 지원
--  1) source_code, source_id — 소스별 원본 식별 (중복 제거 + 증분 수집)
--  2) published_at, fetched_at — 최신성 정렬·알림 트리거
--  3) raw_payload — 원본 응답 저장 (나중에 재파싱 가능)
--  4) 5종 태그 배열 (region/age/occupation/benefit/household) + GIN 인덱스
-- ============================================================

-- ━━━ welfare_programs 확장 ━━━
ALTER TABLE welfare_programs
  ADD COLUMN IF NOT EXISTS source_code TEXT,
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS raw_payload JSONB,
  ADD COLUMN IF NOT EXISTS region_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS age_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS occupation_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS benefit_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS household_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS duplicate_of_id UUID;

-- ━━━ loan_programs 확장 (동일 구조) ━━━
ALTER TABLE loan_programs
  ADD COLUMN IF NOT EXISTS source_code TEXT,
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS raw_payload JSONB,
  ADD COLUMN IF NOT EXISTS region_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS age_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS occupation_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS benefit_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS household_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS duplicate_of_id UUID;

-- ━━━ (source_code, source_id) 중복 방지 ━━━
-- 기존에는 title 이 unique 였음 — 유지하되, 소스별로도 중복 방지
-- NULL 은 허용 (기존 데이터 호환)
CREATE UNIQUE INDEX IF NOT EXISTS idx_welfare_source_uniq
  ON welfare_programs(source_code, source_id)
  WHERE source_code IS NOT NULL AND source_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_source_uniq
  ON loan_programs(source_code, source_id)
  WHERE source_code IS NOT NULL AND source_id IS NOT NULL;

-- ━━━ 최신성 정렬 인덱스 ━━━
-- 목록·추천·알림 전부 published_at DESC 기준
CREATE INDEX IF NOT EXISTS idx_welfare_published_desc
  ON welfare_programs(published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_loan_published_desc
  ON loan_programs(published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_welfare_fetched_desc
  ON welfare_programs(fetched_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_loan_fetched_desc
  ON loan_programs(fetched_at DESC NULLS LAST);

-- ━━━ 태그 배열 GIN 인덱스 (교집합 `&&` 연산 빠르게) ━━━
CREATE INDEX IF NOT EXISTS idx_welfare_region_tags
  ON welfare_programs USING GIN(region_tags);
CREATE INDEX IF NOT EXISTS idx_welfare_age_tags
  ON welfare_programs USING GIN(age_tags);
CREATE INDEX IF NOT EXISTS idx_welfare_occupation_tags
  ON welfare_programs USING GIN(occupation_tags);
CREATE INDEX IF NOT EXISTS idx_welfare_benefit_tags
  ON welfare_programs USING GIN(benefit_tags);
CREATE INDEX IF NOT EXISTS idx_welfare_household_tags
  ON welfare_programs USING GIN(household_tags);

CREATE INDEX IF NOT EXISTS idx_loan_region_tags
  ON loan_programs USING GIN(region_tags);
CREATE INDEX IF NOT EXISTS idx_loan_age_tags
  ON loan_programs USING GIN(age_tags);
CREATE INDEX IF NOT EXISTS idx_loan_occupation_tags
  ON loan_programs USING GIN(occupation_tags);
CREATE INDEX IF NOT EXISTS idx_loan_benefit_tags
  ON loan_programs USING GIN(benefit_tags);
CREATE INDEX IF NOT EXISTS idx_loan_household_tags
  ON loan_programs USING GIN(household_tags);

-- ━━━ 소스별 수집 상태 로그 ━━━
-- 각 소스의 마지막 수집 시각 + 마지막 본 sourceId — 증분 수집에 사용
CREATE TABLE IF NOT EXISTS source_fetch_log (
  source_code TEXT PRIMARY KEY,
  last_fetched_at TIMESTAMPTZ DEFAULT now(),
  last_source_id TEXT,
  last_published_at TIMESTAMPTZ,
  last_collected_count INT DEFAULT 0,
  last_error TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE source_fetch_log ENABLE ROW LEVEL SECURITY;
-- 이 테이블은 서버(service_role) 만 접근 — 일반 사용자 정책 없음

-- ━━━ duplicate_of_id FK (같은 테이블 내부 참조) ━━━
-- cross-source 중복 감지 시 하나를 canonical 로 두고 나머지는 포인터로 연결
-- ON DELETE SET NULL — canonical 이 삭제되면 포인터 해제
ALTER TABLE welfare_programs
  DROP CONSTRAINT IF EXISTS welfare_duplicate_of_fk,
  ADD CONSTRAINT welfare_duplicate_of_fk
    FOREIGN KEY (duplicate_of_id) REFERENCES welfare_programs(id) ON DELETE SET NULL;

ALTER TABLE loan_programs
  DROP CONSTRAINT IF EXISTS loan_duplicate_of_fk,
  ADD CONSTRAINT loan_duplicate_of_fk
    FOREIGN KEY (duplicate_of_id) REFERENCES loan_programs(id) ON DELETE SET NULL;

-- ━━━ 기존 데이터 호환 ━━━
-- source 값이 '복지로', '지자체' 등으로 이미 들어있으므로 source_code 를 유추
-- (1회성 백필 — 재실행해도 안전)
UPDATE welfare_programs SET source_code = 'bokjiro'
  WHERE source_code IS NULL AND source = '복지로';
UPDATE welfare_programs SET source_code = 'local-welfare'
  WHERE source_code IS NULL AND source IN ('지자체','서울특별시','부산광역시','대구광역시','인천광역시',
    '광주광역시','대전광역시','울산광역시','세종특별자치시','경기도','강원도','강원특별자치도',
    '충청북도','충청남도','전라북도','전북특별자치도','전라남도','경상북도','경상남도','제주특별자치도');
UPDATE welfare_programs SET source_code = 'youth-v1'
  WHERE source_code IS NULL AND source = '온통청년';
UPDATE welfare_programs SET source_code = 'legacy'
  WHERE source_code IS NULL;

UPDATE loan_programs SET source_code = 'mss'
  WHERE source_code IS NULL AND source = '중소벤처기업부';
UPDATE loan_programs SET source_code = 'legacy'
  WHERE source_code IS NULL;

-- fetched_at 기본값 — 기존 행은 created_at 으로 채움
UPDATE welfare_programs SET fetched_at = created_at WHERE fetched_at IS NULL;
UPDATE loan_programs SET fetched_at = created_at WHERE fetched_at IS NULL;
