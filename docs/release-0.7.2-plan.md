# Release 0.7.2 plan — guarded causal narration pipeline

Date: 2026-08-07
Feature PR: #34, squash SHA `8e5f525c2e6bd020dd822c6008372e32c772e089`
Target: `v0.7.2`

## Scope

Release the accepted minimal causal-pipeline slice:

1. assemble explicit current-main action, event, committed mechanical evidence,
   semantic result, and carry-forward owners into one causal receipt;
2. project only perspective-safe, ID-free facts to the existing narrator;
3. keep the consumer behind the default-off
   `BATTLE_CAUSAL_NARRATION_MODE` guard with no extra LLM call; and
4. stage an immutable no-traffic revision with `narration_guarded` for the
   bounded baseline-versus-guarded trial.

## Release gates

- [x] Feature PR #34 passed `validate`, `security`, `backend-image`, and `worker`.
- [x] Feature changes passed focused and full tests, typecheck, build, authority,
  diff, and PERT checks before merge.
- [x] Feature squash-merged into `main` at `8e5f525`.
- [x] Release PR #35 versions every workspace and lockfile as `0.7.2`, adds dated
  changelog notes, passes the four required checks, and merges as `11d5bef`.
- [x] Annotated `v0.7.2` resolves to the exact merged release commit.
- [x] `Stage release` succeeds with `narration_guarded` and records the immutable
  backend digest, Cloud Run revision, Worker version, preview URL, and mode.
- [x] Exact-image `off` and guarded disposable battles are compared; the central
  causal consequence improved and no bounded code revision was selected. See
  [`evidence/staging-causal-narration-0.7.2-2026-08-07.md`](evidence/staging-causal-narration-0.7.2-2026-08-07.md).
- [x] The owner approved full-cohort guarded activation while the product has a
  single user. `Promote release` run
  [31147799943](https://github.com/mako10k/kshiai/actions/runs/31147799943)
  promoted the exact staged artifacts and passed production smoke.

## Operational boundary

- No SQL migration, backfill, authentication, callback, secret, provider-order,
  or infrastructure-topology change.
- The released code still fails safely to `off` when the environment variable
  is absent or invalid. Release staging now defaults its explicit selection to
  `narration_guarded`, and production promotion rejects a staged revision whose
  selected mode is not `narration_guarded`.
- Production runs `kshiai-api-00029-gub` and Worker version
  `ea366035-e7b5-44f6-8ce4-109900f70f5a` at 100%. The recorded `v0.7.1`
  revision and Worker remain rollback targets.
