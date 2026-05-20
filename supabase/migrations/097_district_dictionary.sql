-- ============================================================
-- 097: district_dictionary — District Phase B 1단계 (5/20)
-- ============================================================
-- 시·군의 읍·면·동·리 단위 매칭 사전.
-- extractor 가 정책 본문에서 sub_district 추출 시 lookup 용도 + 사용자 입력 form 의 dropdown.
--
-- 초기 데이터: 전남 순천 28 읍·면·동 + 6 법정리 (사장님 거주지 매월리 포함).
-- 다른 도시 점차 확장.
-- ============================================================

CREATE TABLE district_dictionary (
  id bigserial PRIMARY KEY,
  province_code text NOT NULL,
  district text NOT NULL,
  sub_district text NOT NULL,
  sub_type text NOT NULL CHECK (sub_type IN ('eup', 'myeon', 'dong', 'ri')),
  aliases text[],
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_district_dict_province_district
  ON district_dictionary(province_code, district);

CREATE INDEX idx_district_dict_sub_district
  ON district_dictionary(sub_district);

COMMENT ON TABLE district_dictionary IS
  'District Phase B (5/20) — 시·군의 읍·면·동·리 단위 매칭 사전. extractor 가 정책 본문에서 sub_district 추출 시 lookup.';

-- 전남 순천시 1읍 + 10면 + 12동 + 6 법정리 초기 데이터
INSERT INTO district_dictionary (province_code, district, sub_district, sub_type, aliases) VALUES
-- 순천시 1읍
('jeonnam', '순천시', '승주읍', 'eup', ARRAY['승주']),
-- 순천시 10면
('jeonnam', '순천시', '해룡면', 'myeon', ARRAY['해룡']),
('jeonnam', '순천시', '서면', 'myeon', NULL),
('jeonnam', '순천시', '황전면', 'myeon', ARRAY['황전']),
('jeonnam', '순천시', '월등면', 'myeon', ARRAY['월등']),
('jeonnam', '순천시', '주암면', 'myeon', ARRAY['주암']),
('jeonnam', '순천시', '송광면', 'myeon', ARRAY['송광']),
('jeonnam', '순천시', '외서면', 'myeon', ARRAY['외서']),
('jeonnam', '순천시', '낙안면', 'myeon', ARRAY['낙안']),
('jeonnam', '순천시', '별량면', 'myeon', ARRAY['별량']),
('jeonnam', '순천시', '상사면', 'myeon', ARRAY['상사']),
-- 순천시 12동
('jeonnam', '순천시', '향동', 'dong', ARRAY['향']),
('jeonnam', '순천시', '매곡동', 'dong', ARRAY['매곡']),
('jeonnam', '순천시', '삼산동', 'dong', ARRAY['삼산']),
('jeonnam', '순천시', '조곡동', 'dong', ARRAY['조곡']),
('jeonnam', '순천시', '덕연동', 'dong', ARRAY['덕연']),
('jeonnam', '순천시', '풍덕동', 'dong', ARRAY['풍덕']),
('jeonnam', '순천시', '남제동', 'dong', ARRAY['남제']),
('jeonnam', '순천시', '저전동', 'dong', ARRAY['저전']),
('jeonnam', '순천시', '장천동', 'dong', ARRAY['장천']),
('jeonnam', '순천시', '중앙동', 'dong', NULL),
('jeonnam', '순천시', '도사동', 'dong', ARRAY['도사']),
('jeonnam', '순천시', '왕지동', 'dong', ARRAY['왕지']),
-- 사장님 거주지 월등면 법정리
('jeonnam', '순천시', '매월리', 'ri', ARRAY['매월']),
('jeonnam', '순천시', '신성리', 'ri', NULL),
('jeonnam', '순천시', '월용리', 'ri', NULL),
('jeonnam', '순천시', '계월리', 'ri', NULL),
('jeonnam', '순천시', '대평리', 'ri', NULL),
('jeonnam', '순천시', '대광리', 'ri', NULL);
