# Release 0.8.0 plan — persistent E2E observation realm

Date: 2026-08-07
Feature PR: #38, squash SHA `0dcc0c5ef8e704eb409ad34c6a3dd352d7594442`
Target: `v0.8.0`

## Scope

Release the smallest reusable production-observation loop:

1. keep general users outside a server-owned test realm while test, E2E, and
   administrator identities can exercise its shared assets;
2. reuse two stable cross-account identities, characters, battlefield, and
   narrator without resetting their accumulated history;
3. retain every E2E battle and a sanitized public observation artifact; and
4. bind `mako10k@mk10.org` as administrator in the staged immutable revision.

## Release gates

- [x] Feature PR #38 passed `validate`, `security`, `backend-image`, and `worker`.
- [x] Feature changes passed focused and full tests, typecheck, build, workflow,
  diff, and PERT checks before merge.
- [x] Feature squash-merged into `main` at `0dcc0c5`.
- [x] Release PR #39 versions every workspace and lockfile as `0.8.0`, adds
  dated changelog notes, passes the four required checks, and merges as
  `001f928e1667050ee101c656d6f422e85fc34841`.
- [x] Annotated `v0.8.0` resolves to the exact merged release commit.
- [x] `Stage release` run 31150701052 applies migration
  `0007_account_kind.sql`, creates no-traffic revision
  `kshiai-api-00032-giy` with the administrator binding, and passes all smokes.
- [x] `Promote release` run 31151087653 promotes that exact revision and Worker
  `1a4431e2-0d79-4f62-ae11-bc8a07d7926d`, then passes production health,
  authentication, and SSE smoke and publishes the GitHub Release.
- [ ] The protected observer reuses or creates its fixed accounts and fixtures,
  completes one cross-account battle, and retains the battle and artifact.

## Operational boundary

- Migration `0007_account_kind.sql` is additive and defaults all existing users
  to `general`; no data is deleted or backfilled into the test realm.
- `mako10k@mk10.org` becomes an administrator only through the exact server
  allowlist on the new revision. No client-visible role or token claim is added.
- The observer rotates non-human account passwords, but never deletes its auth
  users, application users, characters, battlefield, narrator, or battles.
- The current `v0.7.2` revision and Worker remain the rollback targets. The old
  backend ignores the additive column and remains schema-compatible.
