-- 2026-10-20 공식 원문에서 확인한 전국 참여처 근거만 기존 기사 한 편에 보완합니다.
-- 제목·기존 분류·근거가 바뀌었다면 덮어쓰지 않습니다.
update public.editorial_news_publications
set article = jsonb_set(article, '{classification}',
  '{"benefits":["문화"],"regions":["nationwide"],"regionEvidence":"공모로 선정된 기획프로그램도 전국 곳곳에서 만나볼 수 있다"}'::jsonb)
where source_id = '148973768' and status = 'published'
  and article->>'title' = '2026 한복문화주간, 국내외 410여 곳서 전시·체험·할인 혜택 제공'
  and article->'classification' = '{"benefits":["문화"],"regions":["unclassified"]}'::jsonb
  and position('공모로 선정된 기획프로그램도 전국 곳곳에서 만나볼 수 있다' in evidence->>'body') > 0;
