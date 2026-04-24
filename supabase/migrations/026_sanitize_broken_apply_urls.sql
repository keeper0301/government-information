-- ============================================================
-- 026 apply_url 정제 — 확실히 깨진 URL 19건만 NULL 처리
-- ============================================================
-- 배경: 상세 페이지 '신청하기' 버튼이 에러 페이지로 이동하는 사고.
-- 전수조사 (2026-04-24) 결과:
--   · welfare 4건: 쿼리 없는 .do / 홈페이지 only — 서버가 어떤 정책인지 모름
--     - 서울시 청년수당 (youth.seoul.go.kr/youth/policy/view.do)
--     - 청년 내일채움공제 (work.go.kr/.../dtlEmpSrchList.do)
--     - 국민취업지원제도 II유형 (work24.go.kr/.../empSptSrvcList.do)
--     - 경기도 청년 기본소득 (https://apply.gg.go.kr)
--   · loan 15건: 한글·공백 URL 에 섞임 — 설명문이 URL 에 통째로 들어감
--     - 서민금융진흥원 14건 (kinfa.or.kr 뒤에 "(서금원 홈페이지...)")
--     - 전북신용보증재단 1건 ("NH농협은행, 전북은행")
--
-- 정책:
--   · 원본 값을 source_url 에 백업 (되돌릴 수 있도록)
--   · apply_url 만 NULL 처리
--   · 상세 페이지는 NULL 시 "{source}에서 신청 방법 찾기" Google 검색 fallback
--
-- 홈페이지 only URL (loan 711건) 과 쿼리없는 .do (loan 207건) 은
-- 이번 migration 에서 건드리지 않음 — URL 자체는 유효하므로 UI 에서만
-- '신청하기' 대신 '기관 홈페이지 방문' 으로 라벨 분기 (lib/utils/apply-url.ts
-- isDeepLink 헬퍼 + 상세 페이지 3단 분기).
-- ============================================================

-- welfare: 쿼리·프래그먼트 없는 .do/.jsp/.asp/.aspx + 홈페이지 only
update welfare_programs
set
  source_url = coalesce(source_url, apply_url),
  apply_url = null,
  updated_at = now()
where apply_url is not null
  and (
    (apply_url ~* '\.(do|jsp|asp|aspx)$' and apply_url !~ '[?&#]')
    or apply_url ~ '^https?://[^/]+/?$'
  );

-- loan: 공백 포함 (percent-encoded 포함) + 한글 포함
update loan_programs
set
  source_url = coalesce(source_url, apply_url),
  apply_url = null,
  updated_at = now()
where apply_url is not null
  and (
    apply_url ~ '\s'
    or apply_url ~ '[가-힣]'
    or apply_url ~ '%20'
  );
