-- Run once:  psql "$DATABASE_URL" -f sql/schema.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  user_id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text        NOT NULL,
  email                       text        NOT NULL,
  google_id                   text        NOT NULL UNIQUE,
  registration_date           timestamptz NOT NULL DEFAULT now(),
  subscription_tier           text        NOT NULL DEFAULT 'personal'
                              CHECK (subscription_tier IN ('personal','commercial')),
  subscription_verified_until timestamptz,
  account_status              text        NOT NULL DEFAULT 'active'
                              CHECK (account_status IN ('active','banned')),
  ban_reason                  text,
  role                        text        NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  token_version               integer     NOT NULL DEFAULT 0,
  user_progress               jsonb       NOT NULL DEFAULT '{}'::jsonb
                              CHECK (jsonb_typeof(user_progress) = 'object'),
  last_login_at               timestamptz,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  grade                       smallint CHECK (grade BETWEEN 9 AND 12),
  school                      text CHECK (char_length(school) <= 120),
  stream                      text CHECK (stream IN ('natural','social')),
  username                    text,
  username_updated_at         timestamptz,
  CONSTRAINT users_username_format_check CHECK (
    username IS NULL OR (char_length(username) BETWEEN 3 AND 20 AND username ~ '^[A-Za-z0-9_]+$')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username)) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_status_idx ON users (account_status);
CREATE INDEX IF NOT EXISTS users_registered_idx ON users (registration_date DESC);

CREATE TABLE IF NOT EXISTS admin_audit (
  id         bigserial PRIMARY KEY,
  admin_id   uuid NOT NULL REFERENCES users(user_id),
  target_id  uuid NOT NULL REFERENCES users(user_id),
  action     text NOT NULL,
  detail     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS news_posts (
  id          bigserial PRIMARY KEY,
  title       text    NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body        text    NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  image_data  bytea,
  image_type  text CHECK (image_type IN ('image/jpeg','image/png','image/webp')),
  published   boolean NOT NULL DEFAULT true,
  author_id   uuid REFERENCES users(user_id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  post_kind   text    NOT NULL DEFAULT 'official'
                              CHECK (post_kind IN ('official','community')),
  video_data  bytea,
  video_type  text CHECK (video_type IS NULL OR video_type IN ('video/mp4','video/webm'))
);
CREATE INDEX IF NOT EXISTS news_posts_created_idx ON news_posts (id DESC);
CREATE INDEX IF NOT EXISTS news_posts_feed_idx
  ON news_posts (published, post_kind, id DESC);
CREATE INDEX IF NOT EXISTS news_posts_feed_created_idx
  ON news_posts (published, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS news_posts_feed_kind_created_idx
  ON news_posts (published, post_kind, created_at DESC, id DESC);

ALTER TABLE news_posts
  ADD COLUMN IF NOT EXISTS post_kind text NOT NULL DEFAULT 'official';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'news_posts_post_kind_check'
      AND conrelid = 'news_posts'::regclass
  ) THEN
    ALTER TABLE news_posts
      ADD CONSTRAINT news_posts_post_kind_check
      CHECK (post_kind IN ('official','community'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS post_comments (
  comment_id   bigserial PRIMARY KEY,
  post_id      bigint NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
  author_id    uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  parent_id    bigint REFERENCES post_comments(comment_id) ON DELETE CASCADE,
  body         text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS post_comments_post_idx
  ON post_comments (post_id, created_at DESC, comment_id DESC);
CREATE INDEX IF NOT EXISTS post_comments_parent_idx
  ON post_comments (parent_id);

CREATE TABLE IF NOT EXISTS post_reactions (
  post_id       bigint NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN ('like','love','helpful','insightful')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS post_reactions_post_idx
  ON post_reactions (post_id, reaction_type);

CREATE TABLE IF NOT EXISTS post_reports (
  report_id   bigserial PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  post_id     bigint REFERENCES news_posts(id) ON DELETE CASCADE,
  comment_id  bigint REFERENCES post_comments(comment_id) ON DELETE CASCADE,
  reason      text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  status      text NOT NULL DEFAULT 'open'
              CHECK (status IN ('open','reviewing','resolved','dismissed')),
  reviewed_by uuid REFERENCES users(user_id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((post_id IS NOT NULL AND comment_id IS NULL)
      OR (post_id IS NULL AND comment_id IS NOT NULL))
);
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

CREATE TABLE IF NOT EXISTS user_friends (
  user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);
CREATE INDEX IF NOT EXISTS user_friends_friend_idx
  ON user_friends (friend_id, user_id);

CREATE TABLE IF NOT EXISTS moderation_audit (
  audit_id   bigserial PRIMARY KEY,
  admin_id   uuid NOT NULL REFERENCES users(user_id),
  action     text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('post','comment','report','user')),
  target_id  bigint,
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moderation_audit_admin_created_idx
  ON moderation_audit (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_audit_target_idx
  ON moderation_audit (target_type, target_id, created_at DESC);
