-- ============================================================
-- 029 emergency·고유가·에너지 정책 일괄 재태깅
-- ============================================================
-- 배경 (2026-04-25):
--   사용자 요청 — "고유가 지원금" 같은 핫토픽이 사이트에 잘 안 잡힘.
--   원인: news-keywords.ts·taxonomy.ts 에 해당 키워드 정규식이 없어서
--   기존에 들어와 있는 뉴스·공고에 태그가 안 붙음.
--
--   코드 측은 41a0f21 + e224804 커밋에서 수정. 새로 들어오는 데이터는
--   자동 태깅됨. 이 마이그레이션은 기존 누적 데이터 일괄 보강.
--
-- 적용 대상:
--   1. news_posts.keywords: 고유가/에너지/긴급지원 추가
--   2. welfare_programs.benefit_tags: 생계 (긴급재난·위기가구) + 에너지 (고유가)
--   3. loan_programs.benefit_tags: 동일
--
-- 멱등성:
--   - 이미 태그가 있는 row 는 not (... @> ...) 로 건너뜀
--   - 여러 번 실행해도 결과 동일
--
-- 롤백:
--   - 추가만 하므로 기존 데이터 손실 없음 (필요시 array_remove 로 역순)
-- ============================================================

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. news_posts: keywords 보강
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1a. "고유가" 키워드
update news_posts
set keywords = array_append(keywords, '고유가'),
    updated_at = now()
where (title || ' ' || coalesce(summary, '') || ' ' || coalesce(body, ''))
        ~ '고유가|유가|유류비|휘발유|경유|기름값|석유가격'
  and not (keywords @> array['고유가']);

-- 1b. "에너지" 키워드 (전기·가스·난방비 등)
update news_posts
set keywords = array_append(keywords, '에너지'),
    updated_at = now()
where (title || ' ' || coalesce(summary, '') || ' ' || coalesce(body, ''))
        ~ '에너지요금|전기비|전기요금|가스비|난방비|등유|연료비'
  and not (keywords @> array['에너지']);

-- 1c. "긴급지원" 키워드 (재난지원금·긴급복지·위기가구 등)
update news_posts
set keywords = array_append(keywords, '긴급지원'),
    updated_at = now()
where (title || ' ' || coalesce(summary, '') || ' ' || coalesce(body, ''))
        ~ '긴급지원|긴급재난|긴급생계|긴급복지|위기가구|재난지원금|특별재난'
  and not (keywords @> array['긴급지원']);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. welfare_programs: benefit_tags 보강
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 2a. "생계" 태그 — 긴급·재난·위기 정책 흡수
update welfare_programs
set benefit_tags = array_append(benefit_tags, '생계'),
    updated_at = now()
where (coalesce(title, '') || ' ' || coalesce(target, '') || ' ' || coalesce(description, ''))
        ~ '긴급지원|긴급재난|긴급복지|위기가구|재난지원금|특별재난'
  and not (benefit_tags @> array['생계']);

-- 2b. "에너지" 태그 — 고유가·유류 정책 흡수
update welfare_programs
set benefit_tags = array_append(benefit_tags, '에너지'),
    updated_at = now()
where (coalesce(title, '') || ' ' || coalesce(target, '') || ' ' || coalesce(description, ''))
        ~ '고유가|유가|유류|기름값|휘발유|경유'
  and not (benefit_tags @> array['에너지']);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. loan_programs: benefit_tags 보강 (동일 패턴)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 3a. "생계" 태그
update loan_programs
set benefit_tags = array_append(benefit_tags, '생계'),
    updated_at = now()
where (coalesce(title, '') || ' ' || coalesce(target, '') || ' ' || coalesce(description, ''))
        ~ '긴급지원|긴급재난|긴급복지|위기가구|재난지원금|특별재난'
  and not (benefit_tags @> array['생계']);

-- 3b. "에너지" 태그
update loan_programs
set benefit_tags = array_append(benefit_tags, '에너지'),
    updated_at = now()
where (coalesce(title, '') || ' ' || coalesce(target, '') || ' ' || coalesce(description, ''))
        ~ '고유가|유가|유류|기름값|휘발유|경유'
  and not (benefit_tags @> array['에너지']);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. 결과 확인 쿼리 (실행 후 사장님 직접 검증용)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SELECT count(*) AS news_고유가 FROM news_posts WHERE '고유가' = ANY(keywords);
-- SELECT count(*) AS news_에너지 FROM news_posts WHERE '에너지' = ANY(keywords);
-- SELECT count(*) AS news_긴급지원 FROM news_posts WHERE '긴급지원' = ANY(keywords);
-- SELECT count(*) AS welfare_에너지 FROM welfare_programs WHERE '에너지' = ANY(benefit_tags);
-- SELECT count(*) AS loan_에너지 FROM loan_programs WHERE '에너지' = ANY(benefit_tags);
