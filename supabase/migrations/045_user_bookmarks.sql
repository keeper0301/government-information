-- supabase/migrations/045_user_bookmarks.sql
-- 사용자 북마크 (찜하기) 기능
--
-- 역할: 사용자가 마음에 드는 정책을 별표로 저장 → /mypage/bookmarks 에서 모아보기.
-- 알림 우선 노출은 후속 단계 (rule 매칭 시 북마크된 정책 가산점) — 이 마이그레이션은 저장소만.

CREATE TABLE IF NOT EXISTS user_bookmarks (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_type TEXT NOT NULL CHECK (program_type IN ('welfare', 'loan')),
  program_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, program_type, program_id)
);

-- /mypage/bookmarks 의 "최신순" 정렬용
CREATE INDEX IF NOT EXISTS idx_user_bookmarks_user_created
  ON user_bookmarks (user_id, created_at DESC);

-- 정책 인기 순위 보강용 — program_id 기준 북마크 수 집계 (LATER)
CREATE INDEX IF NOT EXISTS idx_user_bookmarks_program
  ON user_bookmarks (program_type, program_id);

-- RLS 활성화
ALTER TABLE user_bookmarks ENABLE ROW LEVEL SECURITY;

-- 본인 데이터만 조회 가능
CREATE POLICY user_bookmarks_select_own
  ON user_bookmarks FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 본인 데이터만 INSERT 가능
CREATE POLICY user_bookmarks_insert_own
  ON user_bookmarks FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 본인 데이터만 DELETE 가능
CREATE POLICY user_bookmarks_delete_own
  ON user_bookmarks FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE user_bookmarks IS
  '사용자 북마크 (찜한 정책). PK=(user_id, program_type, program_id) 자체가 중복 방지.';
COMMENT ON COLUMN user_bookmarks.program_type IS
  'welfare 또는 loan. blog/news 는 별도 북마크 대상이 아님 (지금은).';
