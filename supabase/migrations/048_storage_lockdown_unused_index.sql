-- ============================================================
-- 048_storage_lockdown_unused_index — blog-images listing 차단 + 미사용 인덱스 제거
-- ============================================================
-- 1) blog_images_public_read SELECT 정책 제거 (advisor WARN 해소)
--   - 이 정책은 storage.objects 의 bucket_id='blog-images' 행을 public 에 SELECT 허용
--   - 결과적으로 anon 이 PostgREST 로 버킷 안의 모든 파일 list 가능 → 의도치 않은 노출
--   - blog-images 는 public 버킷이라 직접 URL 접근(CDN passthrough)은 정책 없이도 동작
--   - 따라서 정책만 DROP 하면 listing 차단 + URL 접근 보존
--
-- 2) idx_welfare_duplicate_of_id 미사용 인덱스 제거 (advisor INFO 해소)
--   - duplicate_of_id IS NOT NULL 부분 인덱스. 한 번도 사용된 적 없음
--   - 실 쿼리에서 duplicate_of_id 로 조회하지 않음 (제거 안전)
--   - 인덱스 유지비(WRITE 오버헤드, autovacuum) 절감
-- ============================================================

DROP POLICY IF EXISTS blog_images_public_read ON storage.objects;

DROP INDEX IF EXISTS public.idx_welfare_duplicate_of_id;
