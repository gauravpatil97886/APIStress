# Next Phase — Multi-tenant, secure, 1,000-user-ready

> Status: **planned, not started.** Pick this up when v1 is rolled out and we're
> ready to scale beyond a small trusted group.

This document captures the full plan for turning APIStress + PostWomen from a
single-tenant tool (one shared key, one shared bucket of data) into a real
multi-user platform that can safely host 1,000 engineers across Choice Techlab.

---

## 1. What's wrong with what we have today

| Today | Problem at 1,000 users |
|---|---|
| Single `CH_ACCESS_KEY` shared by everyone | Anyone with the key sees everyone's runs. Can't revoke one person without rotating the key for all. No audit trail. |
| `runs.created_by` is a free-text field | Anyone can type any name. No way to prove who actually clicked Run. |
| `pw_workspaces` shared across the deployment | A user's Postman collection is visible to every other user. |
| No login session — key is a static header token | If someone's machine is compromised, attacker has indefinite access. |
| Frontend stores the raw key in `localStorage` | Anyone with browser access reads it; XSS exfiltrates it instantly. |
| No rate-limiting, no audit log | Bad actor can run 50,000 VUs against prod and there's no record. |

In short: today's model is fine for ~5 trusted teammates on a VPN.
**It's wrong for 1,000.**

---

## 2. The target architecture

### 2a. Identity — who are you?

Three options, ranked:

**🥇 Option A — Org SSO (recommended)**
Plug into the existing identity provider (Google Workspace / Microsoft Entra /
Okta) via **OIDC**. We never store passwords.

- ✅ Zero password management — your IdP handles resets, MFA, lockouts.
- ✅ HR offboarding revokes access automatically.
- ❌ Requires one-time setup with your IdP admin.

**🥈 Option B — Email + password**
Built-in users table with bcrypt-hashed passwords + reset email flow.

- ✅ No external dependency.
- ❌ You're now in the password-management business — bcrypt, lockouts, password
     reset, MFA, breach response, GDPR. Real work.

**🥉 Option C — Magic link (passwordless email)**
Email a one-tap login link.

- ✅ No passwords at all.
- ❌ Requires SMTP setup. Slightly clunky for daily use.

**Recommendation: A** if SSO is available, otherwise **C**, then **B**.

### 2b. Sessions

- Issue a **JWT** signed with HS256, lifetime 12 h.
- Store as **`HttpOnly` `Secure` `SameSite=Strict` cookie**, NOT in localStorage.
  Closes the XSS-token-theft hole.
- Refresh-token cookie with 30-day lifetime; rotate on use.
- Logout = invalidate refresh token server-side (small `revoked_tokens` table).

### 2c. Authorization

Three roles, simple:

| Role | Can do |
|---|---|
| **member**  | Run their own load tests. Create their own PostWomen workspaces. See only their own data. (Default for everyone.) |
| **lead**    | Everything member can. Plus see runs/collections shared with their team. Plus invite teammates. |
| **admin**   | Everything. Plus see all data org-wide, manage users, view audit log, set quotas. (~3 people.) |

No fine-grained ACL in v1 — keep it boring. Per-collection sharing in v2.

### 2d. Tenancy — keeping data separate

Three patterns:

**Row-level multi-tenancy (recommended):**
- One Postgres database, one schema.
- Every table gets `user_id UUID NOT NULL REFERENCES users(id)`.
- Every query implicitly filtered by `WHERE user_id = $current_user`.
- Enforced by:
  1. The API layer setting it on every read/write, AND
  2. A Postgres **Row-Level Security (RLS)** policy as a backstop.

**Schema-per-tenant**: separate Postgres schema per user. Total isolation,
operationally heavy at 1,000 users.

**Database-per-tenant**: one DB per user. Overkill.

**Verdict: row-level + RLS.** Simple, fast, scales fine to 10K users on one box.

### 2e. Sharing

Total isolation is too restrictive. Let users opt in:

- **Runs**: a "Share with team" toggle on a run → visible to everyone in same
  `team_id`. Default off.
- **Collections (PostWomen)**: a workspace can be `private` (just you), `team`
  (everyone in your team), or `org` (everyone). Defaults to `private`.
- **Reports**: a public-ish "Share via link" with a 7-day expiring signed token.

### 2f. Audit + observability

A new `audit_log` table tracks every meaningful action with
`(user_id, action, target_type, target_id, ip, ua, ts)`:

- `run.start`, `run.stop`, `report.download`
- `request.send` (PostWomen)
- `user.invite`, `user.role_change`, `user.delete`

Admins see a searchable feed. **This is the single biggest improvement** for an
internal tool — when a load test takes prod down, you immediately know who and
when.

### 2g. Quotas

Per-user limits, configurable by admin:

- Max concurrent runs (default 2)
- Max VUs per run (default 5,000)
- Max total VU-minutes per day (default 50,000)
- Max requests per hour against `Production`-tagged environments (default 10,000)

Without this, anyone can fire 50K VUs at prod once and ruin everyone's day.

---

## 3. Database changes

### New tables

```sql
CREATE TABLE users (
  id           UUID PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  avatar_url   TEXT,
  role         TEXT NOT NULL DEFAULT 'member',  -- member | lead | admin
  team_id      UUID REFERENCES teams(id),
  is_active    BOOL NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE teams (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  id                  UUID PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash  BYTEA NOT NULL,
  ip                  TEXT,
  ua                  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ
);

CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip          TEXT,
  ua          TEXT,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE quotas (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  max_concurrent_runs  INT NOT NULL DEFAULT 2,
  max_vus_per_run      INT NOT NULL DEFAULT 5000,
  daily_vu_minutes     INT NOT NULL DEFAULT 50000,
  prod_reqs_per_hour   INT NOT NULL DEFAULT 10000
);
```

### Modified existing tables

```sql
ALTER TABLE runs            ADD COLUMN user_id UUID REFERENCES users(id);
ALTER TABLE runs            ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private';  -- private | team | org
ALTER TABLE tests           ADD COLUMN user_id UUID REFERENCES users(id);
ALTER TABLE environments    ADD COLUMN user_id UUID REFERENCES users(id);
ALTER TABLE pw_workspaces   ADD COLUMN user_id UUID REFERENCES users(id);
ALTER TABLE pw_history      ADD COLUMN user_id UUID REFERENCES users(id);

-- Backfill existing rows to a "legacy" user, then set NOT NULL.
```

Plus RLS policies on each table:
`USING (user_id = current_setting('app.user_id')::uuid)`.

---

## 4. Backend changes

```
backend/internal/
├── auth/
│   ├── oidc.go         # OIDC client (Google / Okta / Entra)
│   ├── jwt.go          # sign + verify JWTs
│   ├── session.go      # session table CRUD
│   └── middleware.go   # extracts user from cookie, sets request context
├── tenancy/
│   ├── context.go      # CurrentUser(ctx) — used everywhere
│   └── rls.go          # SET app.user_id before each query
├── audit/
│   └── log.go
├── quota/
│   └── enforce.go      # called from runs.Start
└── api/
    ├── handlers/
    │   ├── auth.go     # /login, /logout, /me, OIDC callback
    │   ├── users.go    # admin user management
    │   └── audit.go    # admin audit feed
    └── middleware/
        └── authz.go    # role-based gates
```

Every existing handler needs one change: read
`userID := tenancy.CurrentUser(ctx).ID` at the top, attach to inserts, filter on
selects.

---

## 5. Frontend changes

- **Login page** swaps "paste key" for "Sign in with Google" (OIDC) or email-link.
- Drop `localStorage` token storage. Cookies do the work invisibly.
- New **Profile menu** (top-right): name + avatar, "My account", "Sign out".
- New **Admin section** (only visible to admins): user list, role assignment,
  audit feed, quota editor.
- **Run / Collection cards** get a visibility badge (`Private` / `Team` / `Org`).
- **Sharing UI**: a "Share" button on every run/collection with a small toggle.

---

## 6. Migration plan — 4 phases

### Phase 1 — Add user identity (no data change yet) · ~2 days
- Build `users` / `sessions` tables.
- Wire OIDC (or email + password / magic-link) login.
- Old shared key still works (read-only fallback) so no one is locked out
  during rollout.
- Frontend gets a Sign-in screen behind a feature flag.
- **Outcome:** users can log in with their own identity, but data is still
  shared.

### Phase 2 — Backfill ownership · ~1 day
- One-time migration: assign every existing run/collection to a
  `legacy@choicetechlab.local` user.
- Add `user_id` column NOT NULL on every table.
- Update every query to filter by `user_id`.
- **Outcome:** new runs are private by default. Old data is on the legacy user
  (admins can re-assign as needed).

### Phase 3 — Roles, sharing, audit · ~1 day
- Add `role`, `team_id`, `visibility` columns.
- Sharing UI + audit log.
- Admin pages.
- **Outcome:** controlled visibility. Audit log records every action.

### Phase 4 — Quotas + RLS hardening · ~1 day
- Quotas table + enforcement in `runs.Start`.
- Enable Postgres RLS policies as defence in depth.
- Pen-test: try to fetch another user's run via direct ID — should 404.
- **Outcome:** production-ready isolation.

### Phase 5 (later) — Teams, advanced sharing, expiring share-links
- Multi-team support.
- Public report links with TTL.
- Per-collection ACLs.

---

## 7. Security checklist before going to 1,000 users

- [ ] All endpoints require auth except `/healthz` and the OIDC callback.
- [ ] Tokens are `HttpOnly` `Secure` `SameSite=Strict` cookies. **Never** in
      `localStorage`.
- [ ] Every write is filtered by `user_id` from the session, not from the
      request body.
- [ ] Postgres RLS policies as a safety net.
- [ ] Rate limit logins (5 / min / IP) and run-starts (per quota).
- [ ] CSRF protection on cookie-auth endpoints (`SameSite=Strict` +
      double-submit token for state-changing requests).
- [ ] HTTPS only (Caddy / nginx in front).
- [ ] Audit log is **append-only**; admins can read but not delete.
- [ ] Periodic security review of `audit_log` for anomalies.
- [ ] Backups of Postgres, encrypted at rest.
- [ ] Document an incident-response runbook ("how to revoke a user, kill all
      their runs, and audit what they did in the last 24h").

---

## 8. What this costs

- **~5 days of focused work** (one engineer) for Phases 1–4.
- **One-time IdP setup** (~30 min with your sysadmin) if going SSO.
- **Postgres**: same single instance is fine to ~10K active users on a 4 vCPU /
  16 GB box. No infra change needed.
- **Operational**: an admin-on-call learns the audit log and user management UI.
  Maybe 1 hour of training.

---

## 9. Open questions to answer before starting

1. **Identity provider** — do you have SSO? Which one (Google Workspace / Okta /
   Microsoft Entra / something else)?
2. **Email** — if going email+password or magic-link, do you have an SMTP
   server / SendGrid / Resend account?
3. **Default visibility** — should new runs be `private` (only you), `team`, or
   `org`? Recommended: `private`.
4. **Legacy data** — keep current runs/collections accessible to everyone
   (read-only) for 30 days during transition, or move all to a `legacy` user
   immediately?
5. **Admins** — who initially gets `admin` role? (Need at least one bootstrap
   admin email.)
6. **Teams** — is there team structure today (e.g. "Backend", "Mobile", "QA"),
   or is everyone in one bucket? Default to one team named "Choice Techlab" and
   split later?
7. **Quotas** — are the defaults I proposed (2 concurrent runs, 5K VUs, 50K
   daily VU-min) about right, or should engineers be able to fire 50K VUs?

---

## 10. Bottom line

What we have is fine for a small team. For 1,000 users we need rows tagged with
`user_id`, real auth, role-based admin, and quotas. It's a real piece of work
— 4–5 days — but the path is clear and there are no architectural surprises.

When ready to start: answer the 7 questions in §9, then I'll write the
migration script and the auth slice (Phase 1) and ship it behind a feature
flag.

---

_Last updated: 2026-04-29 — by Gaurav Patil_
