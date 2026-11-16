# Matric500 Forum Code Validation Report

**Review scope:** Forum UI and backend changes described in `forum-ui-backend-changes.md`, checked against the supplied `Matric500-formum-code.zip`.

**Review focus:** JavaScript syntax, route mounting, admin authorization, request headers, and UI/API wiring. Infrastructure recommendations and general operational-risk notes from the accompanying report were excluded.

## Executive result

The forum backend route wiring and admin authorization checks are correctly implemented. No JavaScript syntax errors were found in the project JavaScript files or the inline scripts in `admin.html`, `index.html`, and `login.html`.

One functional mismatch was found: the `/api/news` endpoint is public, but the Forum page is part of the main SPA, and the SPA boot sequence requires a signed-in user before it loads `app.js`. Therefore, anonymous visitors cannot currently reach the Forum UI through the website.

## Checks passed

| Area | Result | Evidence |
|---|---|---|
| Project JavaScript syntax | PASS | `node --check` passed for all 10 project `.js` files. |
| Inline browser scripts | PASS | Extracted inline scripts from `admin.html`, `index.html`, and `login.html` all passed `node --check`. |
| Admin guard behavior | PASS | Direct middleware test: anonymous user → 401; regular user → 403; admin → `next()` called. |
| Admin news route mounting | PASS | `news.admin` is mounted at `/api/admin`; it defines GET/POST `/news`, PUT/DELETE `/news/:id`, and applies `requireAdmin` with `router.use()` before those handlers. |
| Admin page protection | PASS | `/admin` calls `auth.loadUser` and serves `admin.html` only when `req.user.role === 'admin'`; unauthenticated smoke test redirected to `/`. |
| Fetch-header enforcement | PASS | POST without `X-Requested-With: fetch` returned 403; POST with the header but without a session returned 401. |
| Admin UI request paths | PASS | Admin UI calls `/api/admin/news` through its `api('/news')` helper and uses the required fetch header for mutations. |
| Schema/query alignment | PASS by static inspection | `schema.sql` defines `news_posts` with the fields used by public and admin news SQL queries. |

## Finding

### F-01 — Forum UI is not publicly reachable without signing in

**Severity:** Functional mismatch, if “public forum page” means visitors can read posts without an account.

- `index.html` boot logic requests `/api/config` and checks `cfg.user` before loading `app.js`.
- When `cfg.user` is absent, it opens the sign-in gate and does not load the SPA code.
- The Forum route (`#/forum`) and `renderForum()` exist in `app.js`, but that code is therefore not loaded for anonymous visitors.
- In contrast, `GET /api/news` has no `requireAuth` middleware, so the data endpoint itself is public.

**Conclusion:** Public API access is implemented; anonymous Forum page access is not. If the intended behavior is that only signed-in students can see the Forum tab, this is not a defect. If the page must be public to everyone, the SPA boot/navigation flow needs a targeted change.

## Documentation alignment note

The change specification lists `admin.js` among the updated files. In the supplied code, the Forum/news admin UI logic is embedded in the inline script in `admin.html`; `admin.html` does not load `admin.js`. This does not break the current Forum implementation, but the file list in the specification should be corrected if it is intended to describe the actual implementation.

## Test limitations

- The repository has no `test` script (`npm test` reports “Missing script: test”).
- The review environment had no database connection. As a result, database-backed list/create/edit/delete operations and the actual SQL execution could not be integration-tested. The public `GET /api/news` smoke test returned 500 because the database was not connected; this is recorded as an unavailable integration test, not as an infrastructure defect.
- Static inspection confirmed that the table and queried columns align, but that is not a substitute for executing the queries against the target database.

## Final assessment

**Syntax:** PASS  
**Admin authorization and route protection:** PASS  
**Admin UI/API route wiring:** PASS  
**Forum public API:** Correctly exposed  
**Anonymous access to Forum UI:** Not currently enabled (see F-01)  
**Database CRUD integration:** Not verified in this environment  

No code was edited and no Git commit was made during this validation review.
