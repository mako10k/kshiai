# ADR-0015: E2E operator session re-entry for GUI verification

- Status: Accepted
- Date: 2026-08-16
- Decision owner: Product owner
- Related: `docs/persistent-e2e-observation.md`; `backend/src/scripts/persistent-battle-e2e.ts`; `backend/src/e2e-observer.ts`; v0.21.1 battle-screen promote could not be exercised as a participant
- Authority: `0015-e2e-operator-session-reentry.think`

## Context

GUI faults on the real battle screen have been closing slowly because post-promote
checks prove the API and the diagnostics page, not the participant `BattlePage`.
v0.21.1 is the latest example: scroll inset, the object accordion, and the
removal of save-from-battle were covered by unit tests and `/api/health`, then
shipped without a signed-in browser pass.

Playwright is available on the operator machine and is the right driver. It is
not in this workspace, and there is no password the browser can type. Production
auth is Supabase. Persistent E2E already owns two non-human accounts
(`codex-e2e-observer@example.test` as `e2e`, `codex-e2e-opponent@example.test`
as `test`). Each Observe job rotates their password, signs in once, and discards
the secret. `/internal/observations` is not the battle screen. Account kind
stays server-owned (0.8.0): a client claim cannot enter the test realm.

This is an authentication and privacy-boundary decision.

## Decision drivers

- The operator must open the same `BattlePage` a participant sees, on the
  promoted Worker, including bottom navigation.
- The browser session must be a real fixture user, not an admin acting as one.
- Password write authority must stay the existing ephemeral-rotation function.
- General users must keep seeing neither test-realm assets nor this path.
- Google OAuth is not an automation login.
- Playwright must not become a fifth required merge check.

## Considered options

1. Leave verification to health plus `/internal/observations`. This is what
   made GUI fixes slow.
2. Store a durable E2E password in secdat. This contradicts the rotation rule
   and creates a standing test-realm credential.
3. Impersonate from the admin session with an act-as header. `BattlePage`
   would lie about the user and bypass participant identity.
4. Issue a backend session that skips Supabase. That forks production auth.
5. Playwright against local legacy auth only. It does not see the promoted UI.
6. Operator re-entry: rotate the fixture password the same way the Observe job
   does, return it once, and sign in through the normal email/password grant.

## Decision

Choose option 6.

OWNER_ACCEPTANCE: the product owner approved this revision of ADR-0015 on
2026-08-16 with the statement "受け入れます" after the Proposed text was
presented. ACCEPTANCE applies to this revision of ADR-0015.

Rules:

1. Reuse the existing fixture emails. Do not add a third account. Do not let
   clients change `account_kind`.
2. Only a server-owned admin or developer may mint. `general`, `test`, and
   `e2e` callers receive the same `404` as other internal routes.
3. `POST /api/internal/e2e-session` with target `observer` or `opponent`
   rotates the password through `generateEphemeralPassword` and the existing
   Supabase admin write, then returns `{ email, password, accountKind }` once.
   The secret is not stored.
4. The browser signs out the operator and uses the normal Supabase password
   grant. No act-as header, dual session, or backend-issued cookie.
5. A trusted runner that already holds `SUPABASE_SECRET_KEY` may call the same
   mint function for Playwright setup. It must not print the password.
6. A mint invalidates the previous password. Operators must not mint during a
   running Observe workflow.
7. Write a non-secret audit row (operator, target, time). Public artifacts
   keep the existing forbidden keys.
8. `/internal/observations` shows re-entry only to admin/developer and states
   that the current session will end.
9. Playwright lives in this repository. It logs in with a minted session and
   drives `BattlePage`. It is not a required merge check. First use is
   operator and post-promote verification.
10. Playwright must exercise the usable viewport above the bottom navigation,
    the closed object accordion, and the absence of save-from-battle.

## Consequences

### Positive

- An operator can open the promoted battle screen without Google in the
  automation path.
- Password writes stay in one function.
- Test-realm isolation for general users is unchanged.

### Negative and risks

- A mint can race an Observe job's next password grant.
- The JSON response carries a secret for one hop.
- Admin and developer can enter the fixture identities at will.

## Compatibility and migration

No database migration. Fixture ownership, `users.account_kind`, and the
Observe workflow confirmation stay as they are. Application rollback does not
need a schema undo. The existing Observe job remains the pipeline observation
path.

## Verification

After acceptance and implementation:

- A general caller receives `404`.
- An admin or developer mint returns email and password; a second mint rejects
  the first password.
- Sign-in with the returned password yields the fixture `/api/me` and
  `accountKind`.
- The audit row exists and does not contain the password.
- Playwright opens `BattlePage` for a fixture battle and asserts rule 10
  without Google.

## Implementation references

- Authoritative record: `docs/adr/0015-e2e-operator-session-reentry.think`
- Password write: `backend/src/e2e-supabase-admin.ts`
- Mint and audit: `backend/src/services/e2e-session.ts`
- Route: `POST /api/internal/e2e-session`
- UI: `frontend/src/components/E2eSessionReentry.tsx`
- Playwright: `e2e/battle-screen.spec.ts` via `npm run test:e2e-gui`
