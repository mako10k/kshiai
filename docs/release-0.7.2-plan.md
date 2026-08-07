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
- [ ] Release PR versions every workspace and lockfile as `0.7.2`, adds dated
  changelog notes, and passes the four required checks.
- [ ] Annotated `v0.7.2` resolves to the exact merged release commit.
- [ ] `Stage release` succeeds with `narration_guarded` and records the immutable
  backend digest, Cloud Run revision, Worker version, preview URL, and mode.
- [ ] Baseline and guarded disposable battles are compared, with at most one
  bounded pipeline revision before the production-trial decision.
- [ ] Production promotion is decided and approved separately.

## Operational boundary

- No SQL migration, backfill, authentication, callback, secret, provider-order,
  or infrastructure-topology change.
- The new mode defaults to `off`; the staging dispatch explicitly selects
  `narration_guarded` and changes no production traffic.
- A successful staging run is evidence for the next decision, not production
  authorization. Production continues on the recorded `v0.7.1` rollback target
  until a separate promotion is approved.
