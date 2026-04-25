-- 034_enrich_news_benefit_tags.sql
-- news_posts.benefit_tags 일괄 채움 (lib/tags/taxonomy.ts 의 extractBenefitTags TS 함수와 동일 룰).
-- press 제외. 모든 row 재계산 (idempotent).
--
-- 방식: 임시 PL/pgSQL 함수 (pg_temp) 정의 → UPDATE 일괄 적용 → 함수 자동 정리.
-- ROLLBACK: UPDATE news_posts SET benefit_tags = ARRAY[]::TEXT[];
--
-- 신규 수집분은 Task 14 의 컬렉터 정합성 작업에서 자동 채움.

CREATE OR REPLACE FUNCTION pg_temp.extract_benefit_tags(_text TEXT)
RETURNS TEXT[] AS $$
DECLARE
  cleaned TEXT;
  tags TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF _text IS NULL OR length(trim(_text)) = 0 THEN
    RETURN ARRAY['기타']::TEXT[];
  END IF;

  -- FP_PATTERNS_BENEFIT 와 동일 — 정책 맥락 아닌 매칭 차단
  cleaned := regexp_replace(
    _text,
    '사유가|이유가|자유가|군경유족|경유하|경유함|을 경유|를 경유|로 경유|유가증권|유가물|전기차|전기자전거|전기철도|전기설비|전기공사|가스공사|가스안전|가스보일러|가스레인지',
    ' ',
    'g'
  );

  IF cleaned ~ '주거|임대|월세|주택|전세|보증금|공공임대|임차' THEN tags := tags || ARRAY['주거']::TEXT[]; END IF;
  IF cleaned ~ '의료|건강|병원|진료|건강검진|의료비|건강보험|치료' THEN tags := tags || ARRAY['의료']::TEXT[]; END IF;
  IF cleaned ~ '양육|보육|출산|아동|임산부|어린이집|유아|출생|산후' THEN tags := tags || ARRAY['양육']::TEXT[]; END IF;
  IF cleaned ~ '교육|학자금|장학|학습|교육비|진학' THEN tags := tags || ARRAY['교육']::TEXT[]; END IF;
  IF cleaned ~ '문화|여가|체육|공연|관광' THEN tags := tags || ARRAY['문화']::TEXT[]; END IF;
  IF cleaned ~ '취업|일자리|고용|구직|직업훈련|인턴' THEN tags := tags || ARRAY['취업']::TEXT[]; END IF;
  IF cleaned ~ '창업|스타트업|벤처|기업가|사업 ?자금' THEN tags := tags || ARRAY['창업']::TEXT[]; END IF;
  IF cleaned ~ '대출|보증|금융|이자|저축|자금 지원' THEN tags := tags || ARRAY['금융']::TEXT[]; END IF;
  IF cleaned ~ '생계|기초수급|차상위|생활비|긴급지원|긴급재난|긴급복지|위기가구|재난지원금|특별재난' THEN tags := tags || ARRAY['생계']::TEXT[]; END IF;
  IF cleaned ~ '에너지|전기료|전기비|전기세|전기요금|가스료|가스비|가스요금|난방비|난방료|난방 지원|연료비|등유 지원|등유 보조|고유가|국제유가|원유가|유류세|유류비|유류대|유류환급|기름값|석유가격|휘발유 (가격|값|보조|환급|지원|보전)|경유 (가격|값|보조|환급|지원|보전)' THEN tags := tags || ARRAY['에너지']::TEXT[]; END IF;
  IF cleaned ~ '교통|대중교통|버스|지하철|택시' THEN tags := tags || ARRAY['교통']::TEXT[]; END IF;
  IF cleaned ~ '장례|사망|장제' THEN tags := tags || ARRAY['장례']::TEXT[]; END IF;
  IF cleaned ~ '법률|변호|소송|조정' THEN tags := tags || ARRAY['법률']::TEXT[]; END IF;

  IF cardinality(tags) = 0 THEN tags := ARRAY['기타']::TEXT[]; END IF;
  RETURN tags;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

UPDATE news_posts
SET benefit_tags = pg_temp.extract_benefit_tags(
  COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(body, '')
)
WHERE category != 'press' OR category IS NULL;
