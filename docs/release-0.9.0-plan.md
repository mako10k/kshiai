# Release 0.9.0 plan — internal battle observation surface

Date: 2026-08-07
Feature PR: #41, squash SHA `38e14154911f817d24df1666ddee483ec021b645`
Target: `v0.9.0`

## Scope

Release the smallest application-owned battle diagnostics surface:

1. persist sanitized E2E observations without granting the deploy identity
   broad Cloud Logging read access;
2. expose retained battle logs, raw battle state, current canonical state, and
   canonical turn progression on an unlinked screen separate from BattlePage;
3. allow administrator and developer accounts to inspect all retained battles,
   while test and E2E accounts remain limited to the test realm and general
   accounts receive a hidden `404`; and
4. retain exact semantic and mechanical-world transitions on future turn
   records.

## Release gates

- [x] Feature PR #41 passed `validate`, `security`, `backend-image`, and `worker`.
- [x] Feature changes passed 320 tests, root typecheck, build, focused access and
  persistence tests, diff checks, and both PERT checks before merge.
- [x] Feature squash-merged into `main` at `38e1415`.
- [ ] Release PR versions every workspace and lockfile as `0.9.0`, adds dated
  changelog notes, passes the four required checks, and merges to `main`.
- [ ] Annotated `v0.9.0` resolves to the exact merged release commit.
- [ ] `Stage release` applies `0008_developer_account_kind.sql`, creates the
  no-traffic backend revision and Worker preview, and passes deployment,
  authentication, SSE, R2, administrator-binding, and migration smokes.
- [ ] `Promote release` moves those exact staged artifacts to 100 percent,
  passes production smokes, and publishes the GitHub Release.
- [ ] The protected observer completes a reusable cross-account battle, proves
  E2E access to its raw/canonical detail, and retains the battle, DB observation,
  and non-sensitive workflow receipt.

## Operational boundary

- Migration `0008_developer_account_kind.sql` only expands the existing account
  constraint. It changes no existing account kind and deletes no data.
- `/internal/observations` has no normal menu link and does not modify the
  existing battle page. General users receive `404 not_found` from its API.
- The internal API returns `Cache-Control: private, no-store`. Test and E2E
  identities cannot read general-realm raw battle state.
- `mako10k@mk10.org` remains the server-configured administrator; no role is
  trusted from a browser claim.
- The current `v0.8.1` backend revision `kshiai-api-00034-wuf` and Worker
  `fdcbd30c-b8a8-47dd-a9d5-04b9c9245e86` remain rollback targets. Old code
  treats a future `developer` value as general, which fails closed if rollback
  occurs after such an account is assigned.
