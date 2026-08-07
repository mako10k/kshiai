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
- [x] Release PR #42 versions every workspace and lockfile as `0.9.0`, adds
  dated changelog notes, passes the four required checks, and merges to `main`
  at `bd27dfd63469b162aaf5b0107dbdfc7ae00d2e3a`.
- [x] Annotated `v0.9.0` resolves to that exact merged release commit.
- [x] `Stage release` run 31154719950 applies
  `0008_developer_account_kind.sql`, creates the
  no-traffic backend revision and Worker preview, and passes deployment,
  authentication, SSE, R2, administrator-binding, and migration smokes. The
  resulting revision is `kshiai-api-00036-yew`, image digest is
  `sha256:43c5903cc18a65ed32e67844edbdd8ab6bfd66b370a89c2de9de72e6f90383b3`,
  and Worker version is `7bb7bc30-d34a-4517-bed5-2b9ff0a29371`.
- [x] `Promote release` run 31155105595 moves those exact staged artifacts to
  100 percent, passes production smokes, and publishes the GitHub Release.
- [x] The protected observer run 31155769295 completes reusable cross-account
  battle `btl_03da078a3011a53dbb5cde76`, proves
  E2E access to its raw/canonical detail, and retains the battle, DB observation,
  and non-sensitive workflow receipt. The detail contains 13 turn records and
  12 retained canonical transitions; all fixed fixtures were reused.

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
