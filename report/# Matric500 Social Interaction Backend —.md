# Matric500 Social Interaction Backend — Implementation Report

**Review date:** November 17, 2026  
**Implementation stage:** Backend MVP implemented; database integration not yet validated

## 1. Executive Summary

The initial social backend implementation is present in `social-routes.js`, `schema.sql`, `auth.js`, `news-routes.js`, and `server.js`.

Implemented areas:

- Official and community post separation
- Commercial Tier 2 publishing permissions
- Post creation, editing, and deletion
- Cursor-paginated feeds
- Comments and replies
- Comment editing and moderation deletion
- Reactions
- Post and comment reports
- Admin report review
- Public author identity
- Protected route mounting
- Official-news compatibility

The implementation should not be considered production-ready until PostgreSQL integration testing and the high-priority fixes below are completed.

---

## 2. Files Modified

### `auth.js`

Added:

- `isTier2`
- `requireTier2`
- Tier 2 helper exports

Tier 2 is currently defined as:

- Administrator, or
- User with `subscription_tier = 'commercial'`

Subscription expiry is not currently considered.

### `social-routes.js`

Added:

- Social post listing and post detail APIs
- Community post publishing
- Ownership and administrator authorization
- Comments and replies
- Comment editing and removal
- Reactions
- Post and comment reports
- Admin report review
- Cursor pagination
- Image validation

### `schema.sql`

Added:

- `post_kind` to `news_posts`
- `post_comments`
- `post_reactions`
- `post_reports`
- Supporting indexes
- Backward-compatible `post_kind` alteration

### `news-routes.js`

Updated:

- Official posts are returned by `/api/news`
- Official post images are restricted separately
- Admin news creation explicitly uses `post_kind = 'official'`
- Author UUID is exposed safely as `authorId`

### `server.js`

Added:

- 3 MB JSON limit for `/api/posts`
- Social user route mounting
- Social admin report route mounting
- Existing authentication and fetch-header middleware remain applied

---

## 3. Implemented API Surface

## Public or Optional-Authenticated Posts

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/posts` | Paginated published feed |
| GET | `/api/posts/:id` | Single post |
| GET | `/api/posts/:id/image` | Published post image |
| GET | `/api/posts/:id/comments` | Paginated comments |

`GET /api/posts` supports:

- `limit`
- `before`
- `kind=official`
- `kind=community`

## Tier 2 and Authenticated Post APIs

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/posts` | Create official or community post |
| PUT | `/api/posts/:id` | Edit permitted post |
| DELETE | `/api/posts/:id` | Delete permitted post |
| POST | `/api/posts/:id/comments` | Create comment or reply |
| PUT | `/api/posts/:postId/comments/:commentId` | Edit owned comment |
| DELETE | `/api/posts/:postId/comments/:commentId` | Remove owned or moderated comment |
| PUT | `/api/posts/:id/reactions/:type` | Set a reaction |
| DELETE | `/api/posts/:id/reactions` | Remove a reaction |
| POST | `/api/posts/:id/reports` | Report a post |
| POST | `/api/posts/:postId/comments/:commentId/reports` | Report a comment |

## Admin APIs

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/admin/reports` | List reports |
| PUT | `/api/admin/reports/:id` | Change report status |

---

## 4. Authorization Matrix

| Category | Read | Official post | Community post | Comment | React | Report |
|---|---|---|---|---|---|---|
| Guest | Published content | No | No | No | No | No |
| Tier 1 | Yes | No | No | Yes | Yes | Yes |
| Tier 2/Commercial | Yes | No | Yes | Yes | Yes | Yes |
| Admin | All permitted views | Yes | Yes | Yes | Yes | Yes |

Moderation authorization is enforced on the backend:

- Official posts require administrator role
- Community posts require ownership and Tier 2 or administrator access
- Comments require authentication
- Comment removal permits ownership or admin moderation
- Report review requires administrator role
- Reactions require authentication
- Public reads expose only published feed posts

---

## 5. Database Status

### Added Tables

#### `post_comments`

Stores:

- Post association
- Author
- Optional parent comment
- Comment body
- Deleted timestamp
- Creation/update timestamps

Deleted comments are retained for moderation and reply integrity.

#### `post_reactions`

Stores:

- Post
- User
- Reaction type
- Timestamp

One reaction per user/post is enforced by a composite primary key.

#### `post_reports`

Stores:

- Reporter
- Post or comment association
- Reason
- Status
- Reviewer
- Review timestamp
- Creation timestamp

A database constraint ensures reports reference either a post or a comment, but not both.

### Existing Table Extension

`news_posts.post_kind` distinguishes:

- `official`
- `community`

Existing rows default to `official`.

---

## 6. Implemented Safeguards

- Text length validation
- Validated BigInt identifiers
- Feed and comment pagination limits
- Maximum 1.5 MB image size
- JPEG, PNG, and WebP signature validation
- Backend role checks
- Backend ownership checks
- CSRF fetch-header protection
- Soft deletion for comments
- Cascade deletion for post-owned social records
- No author email exposure
- Public author UUID/name only
- PostgreSQL constraints and indexes

---

## 7. Critical Risks

## Risk 1 — Comment visibility for unpublished posts

`GET /posts/:id/comments` does not verify whether the associated post is published.

### Risk

A caller may retrieve comments belonging to an unpublished or hidden post.

### Required Fix

The comments query should require:

- Published post, or
- Administrator session

## Risk 2 — No database integration validation

No PostgreSQL integration test was available during implementation.

The following remain unverified:

- Schema startup
- Constraint creation
- Feed aggregate SQL
- Filtered feed SQL
- Cursor parameters
- Comment inserts
- Reply parent validation
- Reaction upserts
- Report inserts
- Report status updates
- Image byte storage

## Risk 3 — Feed SQL parameter construction

The post feed currently uses manual SQL parameter replacement:

- `$1`: cursor
- `$2`: limit
- `$3`: kind or current user
- `$4`: kind + current user

This is brittle and should be replaced with simpler, explicitly constructed parameter branches or a query builder.

## Risk 4 — Legacy admin news route overlap

`GET /api/admin/news`, update, and delete operations operate across `news_posts`, including community posts.

This may be suitable for administrator moderation, but it is ambiguous for official-news management.

### Required Action

Choose one model:

1. Official-news endpoints filter `post_kind = 'official'`
2. Community moderation uses separate `/api/admin/posts` endpoints
3. Explicitly document that `/api/admin/news` is allowed to moderate both kinds

## Risk 5 — Image visibility mismatch

The social image endpoint permits administrators to view unpublished images but does not explicitly permit the original owner.

### Required Fix

Allow access when:

- The post is published, or
- The requester is an administrator, or
- The requester owns the post

---

## 8. Moderate Risks

- Duplicate reports are not constrained at the database level
- No per-report or per-target duplicate validation
- No moderation audit log for comment or post removal
- No report-review audit detail
- Comment pagination does not explicitly group replies
- Comments are returned newest-first
- Community post moderation UI is not implemented
- No frontend integration exists for `/api/posts`
- No search endpoint exists
- No follow system exists
- No notification system exists
- No direct-messaging system exists
- Schema execution is still additive rather than migration-versioned
- Global API rate limiting only protects against report spam
- SQL feed queries may become expensive without reaction/comment denormalization

---

## 9. Performance Considerations

### Existing Indexes

- News feed: publication, kind, descending ID
- Comments: post and timestamp/ID
- Comment parents
- Reaction post grouping
- Report status and time

### Missing at Scale

- Cursor index dedicated to `news_posts(published, post_kind, id DESC)` exists
- Comment count could benefit from denormalization
- Reaction aggregation may become expensive for large posts
- Reports should receive reviewer/status indexes
- Public post-detail queries perform multiple subqueries
- No denormalized engagement cache is currently implemented
- No pagination for administrative user or post moderation is complete

---

## 10. Security Considerations

### Working Controls

- Session JWT verification
- Database account lookup
- Banned-account rejection
- Token revision validation
- Administrator role checks
- CSRF fetch-header checks
- Mutation authentication
- Soft comment deletion
- Server-side image validation
- ID validation
- Input text limits

### Missing Controls

- Duplicate-report protection
- Explicit report rate limiting
- Moderation audit trail
- Admin report UI
- Community-post approval policy
- Field-level author privacy policy
- Image ownership access
- Reaction spam controls beyond global limits
- Per-comment edit history
- Content moderation or automated filtering
- Versioned database migration validation

---

## 11. Frontend Readiness

Backend functionality is implemented, but the frontend has not been updated to consume it.

### Still Required

- Render `/api/posts`
- Switch official/community feeds
- Create Tier 2 community posts
- Render comments and replies
- Submit comments
- Edit/delete owned comments
- React to posts
- Report posts/comments
- Load more posts/comments
- Surface loading and error states
- Hide publishing controls for unauthorized users
- Add admin report moderation UI
- Reconcile legacy `/api/news` with `/api/posts`

The frontend must treat all authorization as a display concern only. The backend remains authoritative.

---

## 12. Recommended Priority Actions

## P0 — Before UI Integration

1. Fix comment visibility for unpublished posts
2. Run PostgreSQL integration tests
3. Verify feed SQL parameter handling
4. Verify image ownership/admin access
5. Separate official-news and community-post moderation
6. Add smoke tests for guest/Tier 1/Tier 2/admin permissions

## P1 — Before Production

1. Prevent duplicate reports
2. Add report-specific rate limiting
3. Add moderation audit events
4. Add admin community-post moderation APIs
5. Add a report moderation interface
6. Add explicit reply grouping
7. Add test coverage for cursor boundaries
8. Add community-post edit/publish controls
9. Replace additive startup schema execution with migrations

## P2 — Scaling

1. Add denormalized engagement counts
2. Consider cached reaction counts
3. Add notifications
4. Add search
5. Add direct messaging
6. Add follows or subscription relationships
7. Split social traffic onto dedicated route/service infrastructure

---

## 13. Verification Required

Before deployment, run role-based tests for:

- Guest post feed access
- Guest mutation rejection
- Tier 1 comment/reaction/report access
- Tier 1 community-post rejection
- Tier 2 community-post success
- Tier 2 edit ownership
- Tier 2 edit of another user's post rejection
- Admin official-post creation
- Admin community-post moderation
- Hidden-post comment rejection
- Draft post image ownership
- Reaction replacement
- Reaction removal
- Comment reply validation
- Comment ownership editing
- Comment admin removal
- Duplicate report handling
- Report status transitions
- Cursor pagination without duplicate or skipped posts
- Invalid IDs
- Oversized images
- Invalid image formats
- Mutation without fetch header
- Banned users
- Revoked sessions

---

## 14. Conclusion

The backend implementation has reached a functional MVP stage.

Core social structures and route authorization are present, and the existing official-news system remains compatible. However, SQL behavior, unpublished-post visibility, moderation separation, duplicate reporting, auditability, migration management, frontend integration, and database testing remain the major blockers to production readiness.