# RFC — Phase 0: Auth + Passport Sync

**Status:** Draft · 2026-04-25
**Owner:** @tomi
**Scope:** Move passport data from localStorage-only to D1-backed sync, with email magic-link auth. Free-tier feature, no Pro paywall.

## Why now

打卡's emotional value compounds over time (streaks, total cups, cities visited). localStorage alone risks both real loss (browser eviction, device switch) and *perceived* loss (users won't invest in the ritual if they think it might vanish). Without durable storage, the retention engine we're building does not work.

This is also the prerequisite for the trajectory map (Phase 1) and Pro tier scheduling (Phase 2) — both build on the same auth + DB.

## Non-goals

- Pro tier features (`/yourname` page, booking flow, Stripe) — Phase 2.
- Trajectory map rendering — Phase 1, after this lands.
- Forcing anonymous users to sign up. Anonymous use must remain fully functional; auth is opt-in via a "save your passport" CTA.
- Password auth, OAuth (Google/Apple), 2FA. Magic link only for v1.

## Stack

- **DB:** Cloudflare D1 (one database, bound as `DB` in wrangler.toml).
- **ORM:** Drizzle (schema in `functions/_lib/db/schema.ts`, migrations in `functions/_lib/db/migrations/`).
- **Auth:** Better Auth with email magic link.
- **Email:** Resend (free tier: 100/day, 3K/month — fine for v1).
- **Routes:** new files under `functions/api/auth/*` and `functions/api/passport/*`. Existing AI routes untouched.

Rationale: see `~/.claude/projects/.../memory/project_backend_stack.md`.

## Schema (Drizzle)

```ts
// users — one row per authenticated account
users: {
  id: text (uuid, pk)
  email: text (unique, not null)
  name: text (nullable)  // collected later, not at signup
  username: text (unique, nullable)  // for /yourname, Phase 2
  createdAt: integer (ms)
  updatedAt: integer (ms)
}

// sessions, accounts, verification — managed by Better Auth (it owns these tables)

// visited_shops — one row per (user, place_id), mirrors VisitedShopSnapshot
visited_shops: {
  userId: text (fk → users.id)
  placeId: text  // Google Places id, current `id` field
  name: text
  address: text
  lat: real
  lng: real
  googleMapsUri: text (nullable)
  city: text (nullable)
  visits: text (JSON array of ms timestamps, newest-first)  // mirrors client model
  updatedAt: integer (ms)
  PRIMARY KEY (userId, placeId)
}
```

**Decision: `visits` stays a JSON column for now.** Mirrors the client model exactly, makes sync trivial. Refactor to a separate `visits` table when we need date-range queries that JSON1 can't do efficiently — likely never at v1 scale (a heavy user might have ~500 visits across ~100 shops, all in-memory anyway).

## Auth flow (magic link)

1. **Request link** — `POST /api/auth/send-magic-link { email }`
   - Better Auth generates token, persists, returns 200.
   - Server sends email via Resend with link `https://acoffee.com/auth/verify?token=xxx`.
   - Rate limit: 5 requests/hour/email, 20/hour/IP. Reuse `functions/_lib/rateLimit.ts` pattern.
2. **Verify** — `GET /auth/verify?token=xxx` (Pages Function, redirects)
   - Validates token, creates session, sets `acoffee_session` cookie (HttpOnly, Secure, SameSite=Lax, 30d).
   - Redirects to `/?welcome=1` (or whatever original URL was, if we capture it in token state).
3. **Sign out** — `POST /api/auth/sign-out` clears session, deletes server-side session row.

Token TTL: 15 min. Single-use. Tokens stored hashed.

## Sync strategy

**Three states for the client:**
- `anonymous` — no session cookie, localStorage is canonical (current behavior, unchanged).
- `claiming` — first time after login, localStorage data needs to be uploaded.
- `synced` — session active, localStorage is a write-through cache, server is source of truth.

**Claim flow (first login):**
- After successful magic-link verification, client checks if its localStorage has any visited_shops not yet on server (compare by `placeId`).
- If yes, `POST /api/passport/claim { shops: [...] }` — server upserts. Conflict per shop:
  - If server doesn't have it → insert.
  - If server has it → merge `visits[]` arrays as union, dedupe by exact ms timestamp, sort newest-first. Update other fields (name/address/lat/lng/city) only if server version is missing them.
- Server returns canonical state. Client replaces localStorage with server response.

**Steady state (after claim):**
- On app open: `GET /api/passport` — pull canonical state, replace localStorage cache.
- On mark-visited: optimistic local write → `POST /api/passport/visited-shops { shop }` → on response, replace local entry with server canonical.
- On unmark / delete: optimistic delete → `DELETE /api/passport/visited-shops/:placeId` → confirm.
- If POST/DELETE fails (network), queue in localStorage with `pendingSync: true` and retry on next app open or after 30s.

**Multi-device behavior:** server is source of truth. If user打卡 on phone, then opens laptop, laptop pulls server state on open (overwriting any stale localStorage on laptop). Document this in onboarding so it's not a surprise.

## Routes (new Pages Functions)

```
functions/api/auth/send-magic-link.ts   POST
functions/auth/verify.ts                GET   (note: top-level /auth/verify, not /api)
functions/api/auth/sign-out.ts          POST
functions/api/auth/me.ts                GET   (returns current user or 401)

functions/api/passport/index.ts         GET   (full state)
functions/api/passport/claim.ts         POST  (bulk claim from localStorage)
functions/api/passport/visited-shops.ts POST  (upsert one)
functions/api/passport/visited-shops/[placeId].ts  DELETE
```

## Frontend changes

- New `src/context/AuthContext.tsx` — wraps app, exposes `user`, `signIn(email)`, `signOut()`, `isLoading`.
- New `src/components/AuthModal.tsx` — email input + "send magic link" + post-send confirmation state.
- New `src/components/AccountMenu.tsx` — header dropdown: anonymous shows "Sign in", logged-in shows email + "Sign out".
- Update `src/hooks/useVisitedShops.ts` — add sync layer:
  - On mount, if logged in, fetch `/api/passport` and replace localStorage.
  - On state change, if logged in, POST/DELETE to API; if anonymous, current localStorage-only behavior.
- New CTA: after user marks 3rd café visited, show one-time toast "Save your passport across devices →" linking to AuthModal. Dismissible. Suppress for 7 days if dismissed. Track via `cta_save_passport_*` analytics events (mirror existing `analytics.ts` pattern).

## Dependencies (new)

```
better-auth                ~latest
drizzle-orm                ~latest
drizzle-kit                ~latest (devDep)
resend                     ~latest
```

Total bundle impact: server-side only (Pages Functions). Zero client bundle increase.

## Migration / rollout

- **Phase 0a:** schema + auth + magic link, no sync yet. Internal test only.
- **Phase 0b:** sync layer + claim flow. Test with 5-10 friendly users.
- **Phase 0c:** "save your passport" CTA enabled for everyone. Monitor signups + sync errors.

Feature flag: gate the "Sign in" UI behind `import.meta.env.VITE_AUTH_ENABLED === 'true'` for the first two phases. Production toggle without redeploy via env var update.

Anonymous users who never sign in keep working forever — no forced migration, no data loss. The localStorage code path stays in place.

## Open questions (decide before implementing)

1. **Resend account** — needs setup. Domain verification on `acoffee.com` for sender reputation. Can be done in parallel with code work.
2. **`username` collection** — at signup or later? Recommendation: later, when Pro / `/yourname` ships. v1 just collects email.
3. **Visit dedupe tolerance** — current model stores raw ms timestamps. If user打卡 same café twice within 60s by accident, two near-identical entries. Recommendation: dedupe at write time if within 60s of an existing visit (treat as "already counted today").
4. **Email privacy** — emails are PII. We need a one-line privacy note in the auth modal: "We use your email only for sign-in. We don't email marketing." Update privacy policy / terms (do we have one? — likely a follow-up).
5. **D1 binding setup** — `wrangler d1 create acoffee-prod` + add binding to `wrangler.toml` is a real Cloudflare resource creation. Do once, share id, add to wrangler config. Same for a `acoffee-dev` DB for local testing.

## Estimated scope

~1 week solid work for one developer.

| Day | Work |
|---|---|
| 1 | D1 setup, Drizzle scaffold, schema, first migration |
| 2 | Better Auth integration + session middleware in Pages Functions |
| 3 | Magic link send/verify routes + Resend setup + email template |
| 4 | AuthContext + AuthModal + AccountMenu (frontend wiring) |
| 5 | Sync layer in useVisitedShops, claim flow, conflict logic |
| 6 | "Save your passport" CTA + analytics events + edge cases (network failure, expired token, etc.) |
| 7 | E2E test, deploy to staging, internal sanity test |

Phase 0b/0c (broader rollout) adds ~1 more week of polish + monitoring.
