-- ============================================================
-- 030 emergency·고유가·에너지 false positive 정리 + 정밀화
-- ============================================================
-- 배경 (2026-04-25):
--   029 마이그레이션의 정규식이 너무 broad 해서 false positive 발생.
--   - "유가" 단독 → "사유가/이유가/자유가" 결합형 흡수 (561건 중 약 100건)
--   - "경유" 단독 → "을 경유하다" / "군경유족" 매칭 (보훈 정책 다수)
--   - "전기/가스/난방" 단독 → 전기차/가스공사/난방기구 등 unrelated 흡수
--
--   코드 측: news-keywords.ts + taxonomy.ts 에 FP_PATTERNS 추가.
--   매칭 전 FP 단어를 텍스트에서 제거 후 정밀 정규식 적용.
--
-- 적용 대상 (이미 잘못 태깅된 누적 데이터 정리):
--   1. news_posts.keywords: 고유가 false positive 제거
--   2. welfare_programs.benefit_tags: 에너지 false positive 제거
--   3. loan_programs.benefit_tags: 에너지 false positive 제거
--
-- 멱등성: array_remove 사용. 여러 번 실행해도 결과 동일.
-- ============================================================

-- ━━━ 1. news_posts: 고유가 FP 제거 (561 → 458, 103건 제거) ━━━
update news_posts
set keywords = array_remove(keywords, '고유가'),
    updated_at = now()
where '고유가' = ANY(keywords)
  AND NOT (
    regexp_replace(
      title || ' ' || coalesce(summary, '') || ' ' || coalesce(body, ''),
      '사유가|이유가|자유가|행유가|소유가|연유가|군경유족|경유하|경유한|경유할|경유했|경유함|을 경유|를 경유|로 경유|유가증권|유가물|전기차|전기자전거|전기철도|전기설비|전기차량|전기공사|전기 안전|가스공사|가스안전|가스보일러|가스레인지|난방기구',
      ' ', 'g'
    ) ~ '고유가|국제유가|원유가|유류세|유류비|유류대|유류환급|유류 보조|유가 (상승|급등|폭등|환급|보조|지원|보전|대응)|기름값|석유가격|휘발유 (가격|값|보조|환급|지원|보전)|경유 (가격|값|보조|환급|지원|보전)'
  );

-- ━━━ 2. welfare_programs: 에너지 FP 제거 (120 → 44, 76건 제거) ━━━
update welfare_programs
set benefit_tags = array_remove(benefit_tags, '에너지'),
    updated_at = now()
where '에너지' = ANY(benefit_tags)
  AND NOT (
    regexp_replace(
      coalesce(title, '') || ' ' || coalesce(target, '') || ' ' || coalesce(description, ''),
      '사유가|이유가|자유가|군경유족|경유하|경유함|을 경유|를 경유|로 경유|유가증권|유가물|전기차|전기자전거|전기철도|전기설비|전기공사|가스공사|가스안전|가스보일러|가스레인지',
      ' ', 'g'
    ) ~ '에너지|전기료|전기비|전기세|전기요금|가스료|가스비|가스요금|난방비|난방료|난방 지원|연료비|등유 지원|등유 보조|고유가|국제유가|원유가|유류세|유류비|유류대|유류환급|기름값|석유가격|휘발유 (가격|값|보조|환급|지원|보전)|경유 (가격|값|보조|환급|지원|보전)'
  );

-- ━━━ 3. loan_programs: 에너지 FP 제거 (10 → 5, 5건 제거) ━━━
update loan_programs
set benefit_tags = array_remove(benefit_tags, '에너지'),
    updated_at = now()
where '에너지' = ANY(benefit_tags)
  AND NOT (
    regexp_replace(
      coalesce(title, '') || ' ' || coalesce(target, '') || ' ' || coalesce(description, ''),
      '사유가|이유가|자유가|군경유족|경유하|경유함|을 경유|를 경유|로 경유|유가증권|유가물|전기차|전기자전거|전기철도|전기설비|전기공사|가스공사|가스안전|가스보일러|가스레인지',
      ' ', 'g'
    ) ~ '에너지|전기료|전기비|전기세|전기요금|가스료|가스비|가스요금|난방비|난방료|난방 지원|연료비|등유 지원|등유 보조|고유가|국제유가|원유가|유류세|유류비|유류대|유류환급|기름값|석유가격|휘발유 (가격|값|보조|환급|지원|보전)|경유 (가격|값|보조|환급|지원|보전)'
  );
