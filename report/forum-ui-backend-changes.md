# Matric500 Forum UI + Backend Changes

## Overview
This document records the changes made to add a public forum page, client-side rendering, and admin-controlled news publishing using the existing authentication and token control system already present in the project.

## Scope
The work was limited to:
- public forum page and SPA navigation hook-up
- client-side forum post rendering
- backend public route to load published posts
- admin-only news management endpoints under `/api/admin/news`
- admin UI for creating, editing, and deleting forum posts

No new project files were created.

## Existing Auth / Token Control Used
The project already uses a session cookie with JWT and a `token_version` field in `users` for revoking sessions.

Relevant existing protections:
- `auth.js`
  - `loadUser()` verifies the session and checks `token_version`
  - `requireAdmin` blocks non-admin access
  - `requireFetchHeader` enforces fetch-only API access
- `schema.sql`
  - `users.token_version` exists and is already part of the system

This was used to protect admin forum actions without creating a new auth design.

## Files Updated
The changes were intended for the existing app files only:
- `index.html`
- `app.js`
- `server.js`
- `admin.js`
- `admin.html`

## Functional Changes

### 1) Public forum page
A forum tab was added to the app navigation and the view system so the app can switch between home, roadmap, exams, forum, and profile.

### 2) Forum client rendering
The frontend fetches published posts from `/api/news` and renders them in a list inside the SPA view.

### 3) Public backend route
A public route was added to return all published forum posts:
- `GET /api/news`

This reads from `news_posts` in the database and returns the title, body, created date, and author name.

### 4) Admin forum management
Admin-only routes were added under the existing admin router:
- `GET /api/admin/news`
- `POST /api/admin/news`
- `PUT /api/admin/news/:id`
- `DELETE /api/admin/news/:id`

These routes are protected by the existing `requireAdmin` middleware and therefore use the existing token/session authorization model.

### 5) Admin UI
The admin dashboard now contains a forum management section allowing admins to:
- create a new post
- edit an existing post
- delete a post
- toggle whether a post is published

## Database Schema Dependency
This implementation depends on the existing table in `schema.sql`:

```sql
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
```

## Notes
- This system uses the existing database table and existing auth/session handling.
- Public forum content is only published items from `news_posts`.
- Admin actions remain protected by the current `token_version` + session system, not by a new permission system.
- No new files were introduced for this change set.
