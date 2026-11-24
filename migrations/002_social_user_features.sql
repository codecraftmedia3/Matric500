ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS username_updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_username_format_check'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_username_format_check
      CHECK (username IS NULL OR (char_length(username) BETWEEN 3 AND 20 AND username ~ '^[A-Za-z0-9_]+$'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx
  ON users (lower(username))
  WHERE username IS NOT NULL;

ALTER TABLE news_posts
  ADD COLUMN IF NOT EXISTS video_data bytea,
  ADD COLUMN IF NOT EXISTS video_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'news_posts_video_type_check'
      AND conrelid = 'news_posts'::regclass
  ) THEN
    ALTER TABLE news_posts ADD CONSTRAINT news_posts_video_type_check
      CHECK (video_type IS NULL OR video_type IN ('video/mp4','video/webm'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_friends (
  user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);

CREATE INDEX IF NOT EXISTS user_friends_friend_idx
  ON user_friends (friend_id, user_id);
