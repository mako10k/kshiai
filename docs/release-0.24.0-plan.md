# Application v0.24.0 release plan

Owner authorized production deployment on 2026-10-10. Canonical execution plan:
[unified consciousness PERT](unified-consciousness.pert), release/stage/promote.
Governing decision: Accepted ADR0067 revision2 and contract v1 C7. Release
procedure: [release process](release_process.md). Candidate: v0.24.0-rc.1.

New authenticated public battle creation selects consciousness pipeline
unified-consciousness-v1 and battle binding format v6. The internal historical
creation path and saved battles retain their original pipelines. Public schemas
are unchanged. Migration0037 adds private runtime storage without removing old
structures. No existing battle migration or data disposal is included.

Local checkpoint da3f949a verified 250 files/1500 tests before public activation.
Activation adds an HTTP regression for v6, private runtime presence and absence
of legacy runtime, preserving immutable asset, replay, privacy and deletion
checks. A typed offline consciousness fixture executes original advance checks.
Current release validation and exact CI evidence must be recorded separately.

Live inspection before preparation: Cloud Run service kshiai-api in project
kshiai/asia-northeast1 serves revision kshiai-api-00186-zop at100percent.
Stage37930237321 for v0.23.0-rc.20 failed and cannot authorize promotion.
Re-read backend/Worker rollback identities immediately before promotion.

Mandatory next steps: required PR checks, squash merge to main, exact main CI,
annotated candidate tag, Stage release, protected Promote release, independent
production readback. Keep backend digest and Worker version identical between
Stage and production; use OIDC workflows. Do not bypass protection or failed CI.

Stage paid execution (owner separately approved2026-10-10): one persistent
E2E fixture battle, max38 advances, provider attempt ceiling200 (the normal
policy projects200 and rejects the workflow default169), no automatic retry,
character-create smoke false. Model routes: consciousness openai/gpt-6-luna,
world adjudication/narration existing xai routes; read their exact staged model
identities before dispatch. This is functional acceptance, not a comparative
quality or savings trial. Owner approved200 provider attempts for one battle in the explicit request for PR175/candidate v0.24.0-rc.1. A dollar estimate is unavailable from the unpriced
local ledger; do not claim an attempt ceiling is a monetary cap. No paid stage
has been dispatched. Stage includes additive migration, auth/R2 and SSE checks;
production traffic remains unchanged until successful acceptance.

## Correction candidate v0.24.0-rc.2

PR175 merged at a0991e6e, exact-source CI38040112770 passed. Stage38040672331
failed on its one authorized fixture battle. Read-only durable ledger confirms
format6 battle incomplete with PROVIDER_OPERATION_UNCLASSIFIED,1 encounter
physical attempt and failed observation run. Both unified consciousness
operations were refused before HTTP because the closed taxonomy lacked their
operation label. Public traffic remains kshiai-api-00186-zop. Migration0037
was applied successfully; it is additive and no schema rollback is required.

The repair implements existing ADR0067 C5/ADR0051 accounting, without changing
product decisions: provider operation taxonomy v4 adds unified-consciousness-v1
to the existing characterExpression layer for its action/speech/memory output.
Keep all old labels/layers and stored taxonomy v2/v3 identities. Unknown labels
and exhausted ceilings still reject before HTTP. Extend actual SDK operation
accounting and E2E taxonomy regressions;29 offline cases pass. Separately
recheck stored v2/v3 readback without rewriting historical rows.

The original one-battle paid authority is consumed. A new rc.2 fixture battle
requires a fresh concrete approval; no paid retry or production promotion has
been performed. Prepare corrected PR/CI/candidate first, retaining rc.1 failure.
