# Dialogue expression state and history requirement v3 acceptance

- Status: Accepted
- Date: 2026-09-08
- Accepted candidate:
  `docs/dialogue-expression-realization-requirement-v3.md`
- Accepted candidate SHA-256:
  `b5c7f96f1e2d73d2bed4f3356f703942bed4c3c68414e7f06889c56dbad4c265`
- Independent review:
  `docs/dialogue-expression-realization-requirement-review-v3.md`
- Resolution evidence:
  `docs/dialogue-expression-realization-design.md`
- Resolution-evidence SHA-256:
  `3abd90c5e445a39fb2575737c24ae452af17fc40f341378d4fd90ab7c2994a56`

## Owner acceptance

On 2026-09-08 the product owner stated:

> 指摘を修正すればACCEPTです。

The sole review finding E1 is resolved by fixing the existing immutable
`dialoguePipeline.snapshot.schemaVersion` as the contract selector:

- `schemaVersion: 1` retains the legacy Compact contract;
- `schemaVersion: 2` selects the separated Compact
  `expressionState` / `utteranceHistory` / `nextUtterance` contract; and
- persisted V1 snapshots are not reinterpreted, renamed, or migrated.

This uses an existing immutable binding field and adds no policy identifier,
lifecycle identity, opportunity, receipt, or provider-operation identifier.
The acceptance condition is therefore satisfied without changing the reviewed
candidate bytes.

## Acceptance decision

The exact candidate identified by the SHA-256 above is **Accepted**.

This acceptance authorizes the requirement baseline. The owner's earlier
implementation instruction separately authorizes local implementation. It does
not authorize provider calls, remote synchronization, Stage deployment,
production deployment, release, or migration of an existing battle.
