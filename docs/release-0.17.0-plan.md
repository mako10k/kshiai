# v0.17.0 release preparation

Status: preparation only. This document does not authorize tagging, staging,
production promotion, or production writes.

## Release intent

v0.17.0 packages the unreleased battle-pipeline work after v0.16.0. The
`candidate-12-v2` pacing values are provisional. They are not a final balance
claim and do not reserve a separate LLM trial budget. If approved for release,
normal production battles will supply gradual observation evidence, and later
policy revisions will remain separately versioned.

The release branch is based on remote `main` commit
`4bfba23916b82773a04614a00001e711dc7ac1bf` (v0.16.0). The exact v0.17.0
release commit and required-check URLs must be recorded after the release PR is
created.

## Predeployment acceptance

- All workspace package versions are exactly `0.17.0`, and the dated changelog
  describes behavior, database, and operational effects.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact
  release commit.
- The Stage workflow requires an explicit `BATTLE_PACING_POLICY` choice and
  writes it to the no-traffic Cloud Run revision.
- The Promote workflow verifies the staged revision has the owner-approved
  pacing policy before it can promote that revision.
- Administrator-visible pipeline and narration changes have PR screenshots or
  an explicitly recorded reason why they could not be captured locally.
- A read-only current-production pacing baseline is captured after release
  preparation. It must distinguish known observations from missing telemetry
  and must not call an LLM or mutate production.
- Tagging and Stage deployment remain blocked until the owner accepts the
  exact release commit, checks, baseline, candidate policy, and rollback
  target through `T_ACCEPT_PACING_PRODUCTION_TRIAL`.

## Database compatibility review

Migrations `0011` through `0014` only add tables, indexes, or the
`battles.revision` column with a default. They do not drop, rename, or rewrite
the structures used by v0.16.0. PostgreSQL migration rollback is therefore not
planned; application rollback means restoring the recorded v0.16.0 Cloud Run
revision and Worker version while leaving these additive structures in place.

This is a source-level compatibility review, not proof against the live schema.
The Stage workflow must still apply migrations and run the authenticated smoke
checks described in [release_process.md](release_process.md).

## Candidate and rollback configuration

| Purpose | `BATTLE_PACING_POLICY` |
| --- | --- |
| Provisional observation candidate | `candidate-12-v2` |
| Fail-closed rollback/default | `current` |

The selected policy is frozen into newly created battles. Existing battles
retain their persisted policy snapshot, so changing the environment value does
not retroactively change an in-progress battle.

Before Stage, record the current known-good Cloud Run revision, Worker version,
and migration state. A deployment failure must restore those application
artifacts; it must not attempt to reverse PostgreSQL migrations.

## Evidence to complete

- Local validation: typecheck, all 401 tests, application build, Worker dry-run,
  workflow YAML parsing, PERT check/analyze, and `git diff --check` passed on
  2026-08-12. The repository audit check passed with the existing
  `@hono/node-server` advisory exception expiring 2026-09-03; production uses
  Linux and the advisory concerns a Windows-only static path.
- Release commit: pending
- Release PR: pending
- Required checks: pending
- Administrator screenshots: not captured in this workspace because the page
  requires an authenticated administrator session and no local browser fixture
  is configured; the PR must state this limitation rather than substitute an
  unauthenticated or fabricated image
- Read-only production pacing baseline: next PERT task
- Owner acceptance: pending
- Tag, Stage revision, Worker version, production promotion: out of scope until
  the owner gate passes
