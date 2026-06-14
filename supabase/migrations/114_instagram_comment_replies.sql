-- ============================================================
-- 114: Instagram 댓글 답글 대기 큐 (human-in-loop)
-- ============================================================
-- 수집한 IG 댓글 + AI 답글 초안을 보관. 사장님이 어드민에서 승인한 것만 게시.
-- comment_id UNIQUE — 같은 댓글 중복 수집 방지(UPSERT 키).
-- status 흐름: pending(초안 대기) → approved → posted / skipped / failed
-- ============================================================

CREATE TABLE IF NOT EXISTS instagram_comment_replies (
  id BIGSERIAL PRIMARY KEY,

  -- IG 댓글 식별자 (중복 수집 방지 UNIQUE)
  comment_id TEXT NOT NULL UNIQUE,
  media_id TEXT NOT NULL,

  -- 댓글 단 사람 + 본문 + IG 작성 시각
  commenter_username TEXT,
  comment_text TEXT NOT NULL,
  comment_at TIMESTAMPTZ,

  -- AI 답글 초안 (생성 실패 시 NULL — 사장님이 직접 작성)
  draft_reply TEXT,

  -- pending | approved | posted | skipped | failed
  status TEXT NOT NULL DEFAULT 'pending',

  -- 게시 성공 시 IG reply id, 실패 시 error 메시지
  posted_reply_id TEXT,
  error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 어드민 대기 큐: 최신 pending 우선 조회
CREATE INDEX IF NOT EXISTS instagram_comment_replies_status
  ON instagram_comment_replies (status, created_at DESC);

COMMENT ON TABLE instagram_comment_replies IS
  'IG 댓글 + AI 답글 초안 대기 큐 — 사장님 승인 후 게시(human-in-loop)';
