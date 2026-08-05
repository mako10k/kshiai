# Release 0.7.0 plan — value-driven free actions

Date: 2026-08-05
Feature PR: #29, squash SHA `d4a93b99192baf1b94977a787a1514d8f75a35ba`
Target: `v0.7.0`

## Scope

Release the completed vertical slice from
[`battle-free-action-objectives.pert`](battle-free-action-objectives.pert):

1. preserve victory as the default while allowing profile values to outrank it;
2. let isolated character agents reserve one natural-language free action;
3. adjudicate both sides in at most one extra server-only call;
4. lazily promote and concretize canonical objects from validated roots;
5. use bounded held objects as later attack or defense instruments; and
6. derive consistent battle-time profile and scene presentation from WorldState.

## Release gates

- [x] Feature PR #29 passed `validate`, `security`, `backend-image`, and `worker`.
- [x] The feature commit passed 289 repository tests, typecheck, build,
  `llmthink` audit, PERT validation, and `git diff --check` locally.
- [x] The feature branch was removed through squash merge.
- [ ] Release PR versions every workspace and lockfile as `0.7.0`, adds dated
  changelog notes, and passes the four required checks.
- [ ] Annotated `v0.7.0` resolves to the exact merged release commit.
- [ ] `Stage release` succeeds and records immutable backend revision and Worker
  version evidence.
- [ ] The protected `production` environment is approved separately.
- [ ] `Promote release` promotes the exact staged artifacts, passes smoke, and
  publishes the GitHub Release.

## Operational boundary

- No SQL migration, backfill, authentication, callback, secret, provider-order,
  billing, or infrastructure change is included.
- The free-action adjudicator adds at most one LLM request only on a turn that
  contains a reserved free action. Ordinary turns retain the previous budget.
- New persisted fields remain optional; rollback to 0.6.1 ignores them, while a
  later 0.7.0 process can deterministically restore bounded defaults.
- Staging may build and deploy no-traffic artifacts. Production traffic changes
  only in the separately approved promotion workflow.
