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
  stream                      text CHECK (stream IN ('natural','social'))
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
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
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS news_posts_created_idx ON news_posts (id DESC);
