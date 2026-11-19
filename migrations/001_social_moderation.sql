-- Matric500 Social Interaction migration 001
-- Additive and safe to apply repeatedly to an existing database.

ALTER TABLE post_reports
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS post_reports_active_post_unique
  ON post_reports (reporter_id, post_id)
  WHERE status IN ('open', 'reviewing') AND post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS post_reports_active_comment_unique
  ON post_reports (reporter_id, comment_id)
  WHERE status IN ('open', 'reviewing') AND comment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS post_reports_reporter_created_idx
  ON post_reports (reporter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS news_posts_author_feed_idx
  ON news_posts (author_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS moderation_audit (
  audit_id bigserial PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES users(user_id),
  action text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('post','comment','report','user')),
  target_id bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_audit_admin_created_idx
  ON moderation_audit (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_audit_target_idx
  ON moderation_audit (target_type, target_id, created_at DESC);
